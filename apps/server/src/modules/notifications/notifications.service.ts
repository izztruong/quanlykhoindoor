import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { NotificationType } from "../../generated/prisma/client";
import { can, type AuthUser } from "../../middleware/auth";
import { SCOPE_ALL_CODE } from "../roles/permissions";

const expo = new Expo(env.expoAccessToken ? { accessToken: env.expoAccessToken } : {});

/** Kênh thông báo Android — app mobile tạo kênh cùng mã này (src/lib/pushNotifications.ts). */
export const ANDROID_CHANNEL_ID = "default";

/** Người xem màn cài đặt: quyền của họ + vai trò có phải quán không (người xác nhận luôn không phải quán). */
export interface NotificationViewer {
  user: AuthUser;
  isShop: boolean;
}

interface CatalogEntry {
  group: "Đơn hàng" | "Đề xuất chi";
  label: string;
  description: string;
  /** Người này có khả năng nhận loại thông báo này không — màn cài đặt chỉ hiện những loại trả true. */
  appliesTo: (viewer: NotificationViewer) => boolean;
}

/**
 * Người "có quyền duyệt đơn" theo nghĩa nhận được thông báo: phải có thêm phạm vi mọi quán. Thiếu nó
 * thì GET /sales-orders/:id gọi assertOwner và trả 404 trên đơn của quán khác — tức nhận thông báo mà
 * bấm vào không mở được. Giữ khớp với orderApproverIds() bên dưới.
 */
function isOrderApprover(user: AuthUser): boolean {
  return user.isSystem || (can(user, "ORDERS", "APPROVE") && user.scope === "ALL");
}

/** Danh mục duy nhất của các loại thông báo. Thêm loại mới: thêm enum trong schema.prisma + một dòng ở đây. */
export const NOTIFICATION_CATALOG: Record<NotificationType, CatalogEntry> = {
  ORDER_CREATED: {
    group: "Đơn hàng",
    label: "Đơn hàng mới",
    description: "Khi quán tạo đơn hàng hoặc Order nhanh cần bạn duyệt",
    appliesTo: ({ user }) => isOrderApprover(user),
  },
  ORDER_CONFIRMED: {
    group: "Đơn hàng",
    label: "Đơn đã được xác nhận",
    description: "Khi đơn của bạn được xác nhận và chờ bạn xác nhận lại số lượng",
    appliesTo: ({ user }) => can(user, "ORDERS", "ADD"),
  },
  ORDER_SHORT: {
    group: "Đơn hàng",
    label: "Nhận hàng bị thiếu",
    description: "Khi quán nhận hàng ít hơn số đã đặt",
    appliesTo: ({ user }) => isOrderApprover(user),
  },
  ORDER_CANCELLED: {
    group: "Đơn hàng",
    label: "Đơn bị huỷ",
    description: "Khi một đơn hàng liên quan tới bạn bị huỷ",
    appliesTo: ({ user }) => can(user, "ORDERS", "ADD") || isOrderApprover(user),
  },
  EXPENSE_PROPOSAL_CREATED: {
    group: "Đề xuất chi",
    label: "Phiếu cần bạn xác nhận",
    description: "Khi có phiếu đề xuất chi chọn bạn làm người xác nhận",
    // Người xác nhận bắt buộc là tài khoản không phải quán (assertParties trong expenseProposals.service.ts).
    appliesTo: ({ isShop }) => !isShop,
  },
  EXPENSE_PROPOSAL_DECIDED: {
    group: "Đề xuất chi",
    label: "Phiếu được duyệt hoặc bị từ chối",
    description: "Khi phiếu bạn lập được duyệt hoặc bị từ chối",
    appliesTo: ({ user }) => can(user, "EXPENSE_PROPOSALS", "ADD"),
  },
  EXPENSE_PROPOSAL_PAID: {
    group: "Đề xuất chi",
    label: "Phiếu đã tạm ứng hoặc đã chi",
    description: "Khi phiếu bạn lập đã được tạm ứng hoặc đã chi",
    appliesTo: ({ user }) => can(user, "EXPENSE_PROPOSALS", "ADD"),
  },
};

/** Mọi tài khoản nhận thông báo "đơn hàng cần duyệt". Cùng điều kiện với isOrderApprover. */
export async function orderApproverIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      role: {
        OR: [{ isSystem: true }, { permissions: { hasEvery: ["ORDERS.APPROVE", SCOPE_ALL_CODE] } }],
      },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export interface NotifyInput {
  type: NotificationType;
  /** Danh sách id, hoặc hàm tự đi tìm (vd orderApproverIds) — để việc tra cứu cũng nằm sau lớp bắt lỗi. */
  recipientIds: (string | null | undefined)[] | (() => Promise<string[]>);
  /** Người vừa thao tác — không bao giờ tự báo cho chính mình. */
  actorId?: string;
  title: string;
  body: string;
  /** Đường dẫn trong app mobile khi bấm vào thông báo. */
  href?: string;
}

async function notify({ type, recipientIds, actorId, title, body, href }: NotifyInput): Promise<void> {
  const ids = typeof recipientIds === "function" ? await recipientIds() : recipientIds;
  const candidates = [...new Set(ids.filter((id): id is string => Boolean(id) && id !== actorId))];
  if (candidates.length === 0) return;

  // Không có dòng tuỳ chọn = đang bật, nên chỉ cần loại những người đã chủ động tắt.
  const muted = await prisma.notificationPreference.findMany({
    where: { userId: { in: candidates }, type, enabled: false },
    select: { userId: true },
  });
  const mutedIds = new Set(muted.map((m) => m.userId));
  const recipients = candidates.filter((id) => !mutedIds.has(id));
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({ userId, type, title, body, href })),
  });

  const tokens = await prisma.pushToken.findMany({ where: { userId: { in: recipients } }, select: { token: true } });
  const messages: ExpoPushMessage[] = tokens
    .filter((t) => Expo.isExpoPushToken(t.token))
    .map((t) => ({
      to: t.token,
      title,
      body,
      sound: "default",
      channelId: ANDROID_CHANNEL_ID,
      data: href ? { href } : {},
    }));

  const staleTokens: string[] = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    // Mỗi lô tự bắt lỗi: một lô hỏng mạng không được chặn các lô sau.
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, index) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          staleTokens.push(chunk[index].to as string);
        }
      });
    } catch (err) {
      console.error("[notifications] gửi push thất bại", type, err);
    }
  }

  // Máy đã gỡ app hoặc thu hồi quyền — xoá để lần sau khỏi gửi vào chỗ chết.
  if (staleTokens.length > 0) {
    await prisma.pushToken.deleteMany({ where: { token: { in: staleTokens } } });
  }
}

/**
 * Gửi thông báo sau khi thao tác chính đã ghi DB xong. KHÔNG await ở nơi gọi: gửi push mất vài trăm
 * mili-giây, không bắt người đang bấm nút phải chờ, và lỗi gửi thông báo không bao giờ được làm hỏng
 * thao tác chính. Express 5 không bắt promise không được await, nên `.catch` ở đây là bắt buộc — thiếu
 * nó thì một lỗi mạng tới Expo có thể làm sập cả tiến trình Node.
 *
 * Luôn gọi SAU khi commit transaction, không bao giờ gọi bên trong callback `tx`.
 */
export function notifyInBackground(input: NotifyInput): void {
  void notify(input).catch((err) => console.error("[notifications] notify thất bại", input.type, err));
}

// --- Nội dung từng loại. Gom ở đây để các route chỉ còn một dòng gọi. ---

const moneyFormat = new Intl.NumberFormat("vi-VN");

function truncate(text: string, max = 80): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

interface OrderRef {
  id: string;
  code: string;
  createdById: string | null;
}

export const orderNotifications = {
  created(order: OrderRef, actor: AuthUser) {
    notifyInBackground({
      type: "ORDER_CREATED",
      recipientIds: orderApproverIds,
      actorId: actor.id,
      title: "Đơn hàng mới cần duyệt",
      body: `${actor.name} vừa tạo đơn ${order.code}.`,
      href: `/orders/${order.id}`,
    });
  },

  confirmed(order: OrderRef, actor: AuthUser) {
    notifyInBackground({
      type: "ORDER_CONFIRMED",
      recipientIds: [order.createdById],
      actorId: actor.id,
      title: "Đơn hàng đã được xác nhận",
      body: `Đơn ${order.code} đã được xác nhận. Vui lòng kiểm tra và xác nhận lại số lượng.`,
      href: `/orders/${order.id}`,
    });
  },

  short(order: OrderRef, actor: AuthUser) {
    notifyInBackground({
      type: "ORDER_SHORT",
      recipientIds: orderApproverIds,
      actorId: actor.id,
      title: "Đơn hàng nhận thiếu",
      body: `${actor.name} nhận thiếu hàng ở đơn ${order.code}.`,
      href: `/orders/${order.id}`,
    });
  },

  /** Quán tự huỷ đơn của mình → báo người duyệt; người khác huỷ → báo quán đặt đơn. */
  cancelled(order: OrderRef, actor: AuthUser) {
    const cancelledByOther = Boolean(order.createdById) && order.createdById !== actor.id;
    notifyInBackground({
      type: "ORDER_CANCELLED",
      recipientIds: cancelledByOther ? [order.createdById] : orderApproverIds,
      actorId: actor.id,
      title: "Đơn hàng đã bị huỷ",
      body: `${actor.name} đã huỷ đơn ${order.code}.`,
      href: `/orders/${order.id}`,
    });
  },
};

interface ProposalRef {
  id: string;
  code: string;
  createdById: string | null;
  approverId: string | null;
  purpose: string;
  totalAmount: unknown;
  advanceAmount?: unknown;
  rejectReason?: string | null;
}

export const expenseProposalNotifications = {
  created(proposal: ProposalRef, actor: AuthUser) {
    notifyInBackground({
      type: "EXPENSE_PROPOSAL_CREATED",
      recipientIds: [proposal.approverId],
      actorId: actor.id,
      title: "Phiếu đề xuất chi cần xác nhận",
      body: `${actor.name} đề xuất chi ${moneyFormat.format(Number(proposal.totalAmount))}đ — ${truncate(proposal.purpose)}`,
      href: `/expense-proposals/${proposal.id}`,
    });
  },

  decided(proposal: ProposalRef, actor: AuthUser, outcome: "APPROVED" | "REJECTED") {
    notifyInBackground({
      type: "EXPENSE_PROPOSAL_DECIDED",
      recipientIds: [proposal.createdById],
      actorId: actor.id,
      title: outcome === "APPROVED" ? "Phiếu đề xuất chi đã được duyệt" : "Phiếu đề xuất chi bị từ chối",
      body:
        outcome === "APPROVED"
          ? `Phiếu ${proposal.code} đã được ${actor.name} duyệt.`
          : `Phiếu ${proposal.code} bị từ chối: ${truncate(proposal.rejectReason ?? "không ghi lý do")}`,
      href: `/expense-proposals/${proposal.id}`,
    });
  },

  paid(proposal: ProposalRef, actor: AuthUser, step: "ADVANCED" | "SPENT") {
    notifyInBackground({
      type: "EXPENSE_PROPOSAL_PAID",
      recipientIds: [proposal.createdById],
      actorId: actor.id,
      title: step === "ADVANCED" ? "Phiếu đề xuất chi đã tạm ứng" : "Phiếu đề xuất chi đã chi",
      body:
        step === "ADVANCED"
          ? `Phiếu ${proposal.code} đã được tạm ứng ${moneyFormat.format(Number(proposal.advanceAmount ?? 0))}đ.`
          : `Phiếu ${proposal.code} đã chi xong.`,
      href: `/expense-proposals/${proposal.id}`,
    });
  },
};

// --- Phục vụ các route của chính module thông báo ---

export async function listPreferences(viewer: NotificationViewer) {
  const saved = await prisma.notificationPreference.findMany({ where: { userId: viewer.user.id } });
  const enabledByType = new Map(saved.map((p) => [p.type, p.enabled]));

  return (Object.keys(NOTIFICATION_CATALOG) as NotificationType[])
    .filter((type) => NOTIFICATION_CATALOG[type].appliesTo(viewer))
    .map((type) => {
      const { group, label, description } = NOTIFICATION_CATALOG[type];
      return { type, group, label, description, enabled: enabledByType.get(type) ?? true };
    });
}

export function isNotificationType(value: string): value is NotificationType {
  return value in NotificationType;
}
