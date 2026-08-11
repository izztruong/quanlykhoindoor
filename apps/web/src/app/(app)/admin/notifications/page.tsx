"use client";

import { Pagination } from "@/components/data-table/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useClientPagination } from "@/hooks/useClientPagination";
import type { ManagedUser } from "@/hooks/useUsers";
import { useSendZaloTest, useZaloBotStatus, useZaloChatCandidates } from "@/hooks/useNotifications";
import { useUpdateUserZaloChatId, useUsers } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { Check, RefreshCw, Send, X } from "lucide-react";
import { useMemo, useState } from "react";

const cellClass = "border border-slate-200 px-4 py-2";
const headClass = "border border-slate-200 px-4 py-2 text-left font-medium text-slate-600";
const roleLabel: Record<string, string> = { ADMIN: "Quản trị viên", STAFF: "Nhân viên" };

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/** Mỗi vai trò nhận một loại sự kiện khác nhau — nói rõ ra để admin biết mình đang bật cái gì. */
function eventFor(user: ManagedUser): string {
  return user.role === "ADMIN" ? "Có đơn hàng mới" : "Đơn của mình chuyển sang Chờ xác nhận";
}

export default function NotificationsPage() {
  const { data: currentUser } = useCurrentUser();
  const { data: status, isLoading: statusLoading } = useZaloBotStatus();
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const candidates = useZaloChatCandidates();
  const updateChatId = useUpdateUserZaloChatId();
  const sendTest = useSendZaloTest();

  const { page, pageSize, pageItems, total, setPage, onPageSizeChange } = useClientPagination(users);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftChatId, setDraftChatId] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Để chỉ disable đúng nút đang gửi, thay vì disable mọi nút "Gửi thử" trên bảng.
  const [testingId, setTestingId] = useState<string | null>(null);
  // chatId -> userId sẽ gán cho nó, mỗi dòng ở bảng "đã nhắn cho bot" chọn độc lập.
  const [assignTargets, setAssignTargets] = useState<Record<string, string>>({});

  function startEdit(id: string, current: string | null) {
    setSaveError(null);
    setEditingId(id);
    setDraftChatId(current ?? "");
  }

  function save(id: string) {
    setSaveError(null);
    updateChatId.mutate(
      { id, zaloChatId: draftChatId.trim() || null },
      {
        onSuccess: () => setEditingId(null),
        onError: (err) => setSaveError(errorMessage(err, "Lưu Zalo chat ID thất bại")),
      },
    );
  }

  function handleTest(user?: ManagedUser) {
    setTestResult(null);
    setTestingId(user?.id ?? null);
    sendTest.mutate(user?.id, {
      onSuccess: () =>
        setTestResult({ ok: true, message: user ? `Đã gửi tin thử cho ${user.name}.` : "Đã gửi tin nhắn thử. Kiểm tra Zalo của bạn." }),
      onError: (err) => setTestResult({ ok: false, message: errorMessage(err, "Gửi tin nhắn thử thất bại") }),
    });
  }

  if (currentUser && currentUser.role !== "ADMIN") {
    return (
      <Card>
        <CardBody className="text-sm text-slate-500">Bạn không có quyền truy cập trang này.</CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Thông báo Zalo</h1>
        <p className="text-sm text-slate-500">Gửi thông báo cho quản trị viên qua bot Zalo mỗi khi có đơn hàng mới.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trạng thái bot</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3 text-sm">
          {statusLoading ? (
            <p className="text-slate-500">Đang kiểm tra…</p>
          ) : !status?.configured ? (
            <div className="flex flex-col gap-1">
              <Badge tone="red">Chưa cấu hình</Badge>
              <p className="text-slate-600">
                Server chưa có biến môi trường <code className="rounded bg-slate-100 px-1">ZALO_BOT_TOKEN</code>. Tạo bot trên Zalo
                Bot Platform, lấy token rồi khai báo trên Render và khởi động lại service.
              </p>
            </div>
          ) : status.error ? (
            <div className="flex flex-col gap-1">
              <Badge tone="red">Token không dùng được</Badge>
              <p className="text-red-600">{status.error}</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="green">Đã kết nối</Badge>
              <span className="text-slate-600">
                Bot: <strong>{status.bot?.display_name ?? status.bot?.account_name ?? "(không rõ tên)"}</strong>
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => handleTest()} disabled={sendTest.isPending || !status?.configured}>
              <Send size={14} />
              Gửi tin nhắn thử cho tôi
            </Button>
            {testResult && <span className={testResult.ok ? "text-emerald-600" : "text-red-600"}>{testResult.message}</span>}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Người nhận thông báo</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3 p-0">
          <p className="px-4 pt-4 text-sm text-slate-500">
            Bot Zalo không thể nhắn trước cho người lạ. Mỗi người phải <strong>nhắn cho bot một tin bất kỳ</strong> thì mới lấy được
            chat ID — dùng bảng “Người đã nhắn cho bot” bên dưới. Để trống = không nhận thông báo. Sau khi gán, bấm nút{" "}
            <Send size={12} className="inline" /> để gửi tin thử và hỏi lại người đó xem có nhận được không.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={headClass}>Tên</th>
                  <th className={headClass}>Email</th>
                  <th className={headClass}>Nhận thông báo khi</th>
                  <th className={headClass}>Zalo chat ID</th>
                  <th className={headClass}>Trạng thái</th>
                  <th className={headClass}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading && (
                  <tr>
                    <td className={`${cellClass} text-slate-500`} colSpan={6}>
                      Đang tải…
                    </td>
                  </tr>
                )}
                {!usersLoading && pageItems.length === 0 && (
                  <tr>
                    <td className={`${cellClass} text-slate-500`} colSpan={6}>
                      Chưa có tài khoản nào.
                    </td>
                  </tr>
                )}
                {pageItems.map((user) => {
                  const isEditing = editingId === user.id;
                  return (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className={cellClass}>{user.name}</td>
                      <td className={cellClass}>{user.email}</td>
                      <td className={cellClass}>{eventFor(user)}</td>
                      <td className={cellClass}>
                        {isEditing ? (
                          <Input
                            value={draftChatId}
                            onChange={(e) => setDraftChatId(e.target.value)}
                            placeholder="Dán chat ID vào đây"
                            className="h-8"
                            autoFocus
                          />
                        ) : (
                          <span className="font-mono text-xs">{user.zaloChatId ?? "—"}</span>
                        )}
                      </td>
                      <td className={cellClass}>
                        {user.zaloChatId ? <Badge tone="green">Đang nhận</Badge> : <Badge tone="gray">Chưa nhận</Badge>}
                      </td>
                      <td className={cellClass}>
                        {isEditing ? (
                          <div className="flex gap-1">
                            <Button size="sm" onClick={() => save(user.id)} disabled={updateChatId.isPending}>
                              <Check size={14} />
                              Lưu
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              <X size={14} />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Button size="sm" variant="secondary" onClick={() => startEdit(user.id, user.zaloChatId)}>
                              Sửa
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Gửi tin nhắn thử cho tài khoản này"
                              onClick={() => handleTest(user)}
                              disabled={!user.zaloChatId || (sendTest.isPending && testingId === user.id)}
                            >
                              <Send size={14} />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {saveError && <p className="px-4 text-sm text-red-600">{saveError}</p>}
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={onPageSizeChange} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Người đã nhắn cho bot</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => candidates.refetch()}
              disabled={candidates.isFetching || !status?.configured}
            >
              <RefreshCw size={14} />
              {candidates.isFetching ? "Đang chờ tin nhắn…" : "Bắt đầu nhận diện"}
            </Button>
            <span className="text-sm text-slate-500">
              Làm <strong>từng người một</strong>: bấm nút trước, rồi bảo người đó nhắn cho bot trong vòng 25 giây.
            </span>
          </div>

          {candidates.error && <p className="text-sm text-red-600">{errorMessage(candidates.error, "Không tải được danh sách")}</p>}

          {candidates.data && candidates.data.length === 0 && (
            <p className="text-sm text-slate-500">Không nhận được tin nhắn nào. Bấm lại nút trên rồi nhắn cho bot ngay sau đó.</p>
          )}

          {candidates.data && candidates.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={headClass}>Tên hiển thị</th>
                    <th className={headClass}>Chat ID</th>
                    <th className={headClass}>Tin nhắn gần nhất</th>
                    <th className={headClass}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.data.map((c) => {
                    const assignedTo = users.find((u) => u.zaloChatId === c.chatId);
                    return (
                      <tr key={c.chatId} className="hover:bg-slate-50">
                        <td className={cellClass}>{c.displayName ?? "—"}</td>
                        <td className={`${cellClass} font-mono text-xs`}>{c.chatId}</td>
                        <td className={cellClass}>{c.lastMessage ?? "—"}</td>
                        <td className={cellClass}>
                          {assignedTo ? (
                            <span className="text-slate-500">Đã gán cho {assignedTo.name}</span>
                          ) : (
                            // Chọn tài khoản ngay tại dòng: nhìn là biết đang gán cho ai, không
                            // phụ thuộc vào việc đã bấm "Sửa" ở bảng trên hay chưa.
                            <div className="flex items-center gap-2">
                              <Select
                                className="h-8 w-56"
                                value={assignTargets[c.chatId] ?? ""}
                                onChange={(e) => setAssignTargets((prev) => ({ ...prev, [c.chatId]: e.target.value }))}
                              >
                                <option value="">— Chọn tài khoản —</option>
                                {users.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name} ({roleLabel[u.role]})
                                  </option>
                                ))}
                              </Select>
                              <Button
                                size="sm"
                                disabled={!assignTargets[c.chatId] || updateChatId.isPending}
                                onClick={() => {
                                  setSaveError(null);
                                  updateChatId.mutate(
                                    { id: assignTargets[c.chatId], zaloChatId: c.chatId },
                                    { onError: (err) => setSaveError(errorMessage(err, "Gán chat ID thất bại")) },
                                  );
                                }}
                              >
                                Gán
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
