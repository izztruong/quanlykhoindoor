"use client";

import { Pagination } from "@/components/data-table/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useProductGroups, useProducts } from "@/hooks/useCatalog";
import {
  type ProductShopItemInput,
  type ProductShopWarning,
  readProductShopWarnings,
  useProductShop,
  useSaveProductShop,
} from "@/hooks/useProductShops";
import { useReorderThresholds } from "@/hooks/useReorderThresholds";
import { ApiError } from "@/lib/api-client";
import type { ProductType } from "@/types";
import { useMemo, useState } from "react";

const TYPE_LABELS: Record<ProductType, string> = {
  NVL: "Nguyên vật liệu",
  COC_TAKE: "Cốc & ống hút",
  BANH: "Bánh",
  DUNG_CU: "Dụng cụ",
  KHAC: "Khác",
};

interface PendingWarnings {
  willBecomeGlobal: ProductShopWarning[];
  hasHistory: ProductShopWarning[];
}

/**
 * Tab gán HÀNG HOÁ (nguyên liệu) cho một quán.
 *
 * Khác tab món ở một điểm quan trọng: ẩn một hàng hoá khỏi quán KHÔNG phải là "bỏ qua" — Check Cost
 * không thấy dòng kiểm kê thì tính tồn đầu/cuối kỳ bằng 0, nên `actualUsed` phồng lên bằng cả lượng
 * tồn và cột chênh lệch ra số dương lớn vô cớ. Vì vậy server cảnh báo riêng với hàng mà chính quán
 * đó ĐÃ TỪNG kiểm khác 0, và bảng hiện sẵn nhãn đó trước khi người dùng bấm.
 */
export function ProductShopTab({ shopUserId, shopName }: { shopUserId: string; shopName: string }) {
  // Không truyền quán: tab này phải thấy TOÀN BỘ danh mục để gán được.
  const { data: products = [], isLoading } = useProducts();
  const { data: groups = [] } = useProductGroups();
  const { data: assigned } = useProductShop(shopUserId);
  // Chỉ để GỢI Ý ô tích, không phải nguồn chân lý: "khai định lượng" và "có ở quán" là hai việc khác
  // nhau, gộp lại thì admin không nói được "có nhưng không cần định lượng".
  const { data: thresholds = [] } = useReorderThresholds(shopUserId);
  const saveList = useSaveProductShop();

  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [groupId, setGroupId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<PendingWarnings | null>(null);

  const assignedSet = useMemo(() => new Set(assigned?.productIds ?? []), [assigned]);
  const countedSet = useMemo(() => new Set(assigned?.countedProductIds ?? []), [assigned]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      if (type && p.type !== type) return false;
      if (groupId && p.productGroupId !== groupId) return false;
      if (!term) return true;
      return p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term);
    });
  }, [products, search, type, groupId]);

  const pageItems = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  function isAssigned(id: string): boolean {
    return overrides[id] ?? assignedSet.has(id);
  }

  function toggle(id: string, value: boolean) {
    setSaved(false);
    setOverrides((prev) => ({ ...prev, [id]: value }));
  }

  function toggleVisible(value: boolean) {
    setSaved(false);
    setOverrides((prev) => {
      const next = { ...prev };
      for (const p of pageItems) next[p.id] = value;
      return next;
    });
  }

  /** Tích sẵn theo danh sách định lượng Order nhanh của quán — người dùng soát rồi mới lưu. */
  function suggestFromThresholds() {
    setSaved(false);
    setOverrides((prev) => {
      const next = { ...prev };
      for (const t of thresholds) next[t.productId] = true;
      return next;
    });
  }

  function buildItems(): ProductShopItemInput[] {
    const validIds = new Set(products.map((p) => p.id));
    return Object.entries(overrides)
      .filter(([id, isOn]) => validIds.has(id) && isOn !== assignedSet.has(id))
      .map(([productId, isOn]) => ({ productId, assigned: isOn }));
  }

  function submit(confirmWarnings: boolean) {
    const items = buildItems();
    if (items.length === 0) {
      setPending(null);
      setSaved(true);
      return;
    }
    setError(null);
    setSaved(false);
    saveList.mutate(
      { shopUserId, items, confirmWarnings },
      {
        onSuccess: () => {
          setOverrides({});
          setPending(null);
          setSaved(true);
        },
        onError: (err) => {
          const warnings = readProductShopWarnings(err);
          if (
            err instanceof ApiError &&
            err.status === 409 &&
            (warnings.willBecomeGlobal.length > 0 || warnings.hasHistory.length > 0)
          ) {
            setPending(warnings);
            return;
          }
          setPending(null);
          setError(err instanceof ApiError ? err.message : "Lưu danh sách hàng hoá thất bại");
        },
      },
    );
  }

  const changedCount = buildItems().length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Hàng hoá của {shopName}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={suggestFromThresholds}
              disabled={thresholds.length === 0}
            >
              Gợi ý theo định lượng Order nhanh
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => toggleVisible(true)}>
              Tích cả trang
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => toggleVisible(false)}>
              Bỏ tích cả trang
            </Button>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-3 p-0">
          <div className="flex flex-wrap gap-3 px-4 pt-4">
            <Input
              placeholder="Tìm theo tên hoặc mã hàng hoá..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="max-w-sm"
            />
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              className="max-w-[14rem]"
            >
              <option value="">Tất cả loại</option>
              {(Object.keys(TYPE_LABELS) as ProductType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            <Select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setPage(1);
              }}
              className="max-w-[14rem]"
            >
              <option value="">Tất cả nhóm</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="overflow-x-auto px-4">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500">
                  <th className="w-20 border border-slate-200 px-3 py-2">Có ở quán</th>
                  <th className="border border-slate-200 px-3 py-2">Mã</th>
                  <th className="border border-slate-200 px-3 py-2">Tên hàng hoá</th>
                  <th className="border border-slate-200 px-3 py-2">Loại</th>
                  <th className="border border-slate-200 px-3 py-2">Nhóm</th>
                  <th className="border border-slate-200 px-3 py-2">Phạm vi hiện tại</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td className="border border-slate-200 px-3 py-4 text-slate-400" colSpan={6}>
                      Đang tải...
                    </td>
                  </tr>
                )}
                {!isLoading && pageItems.length === 0 && (
                  <tr>
                    <td className="border border-slate-200 px-3 py-4 text-slate-400" colSpan={6}>
                      Không có hàng hoá nào khớp bộ lọc.
                    </td>
                  </tr>
                )}
                {pageItems.map((p) => {
                  const shopCount = p.shops?.length ?? 0;
                  return (
                    <tr key={p.id}>
                      <td className="border border-slate-200 px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={isAssigned(p.id)}
                          onChange={(e) => toggle(p.id, e.target.checked)}
                        />
                      </td>
                      <td className="border border-slate-200 px-3 py-2">{p.code}</td>
                      <td className="border border-slate-200 px-3 py-2">
                        {p.name}
                        {!p.active && <span className="ml-2 text-xs text-slate-400">(ngừng dùng)</span>}
                      </td>
                      <td className="border border-slate-200 px-3 py-2">{TYPE_LABELS[p.type] ?? p.type}</td>
                      <td className="border border-slate-200 px-3 py-2">{p.productGroup?.name ?? "-"}</td>
                      <td className="border border-slate-200 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {shopCount === 0 ? (
                            <Badge tone="yellow">Mọi quán</Badge>
                          ) : (
                            <span className="text-slate-600">Đang gán cho {shopCount} quán</span>
                          )}
                          {countedSet.has(p.id) && <Badge tone="blue">Quán này đã từng kiểm</Badge>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-600">Đã lưu danh sách hàng hoá.</p>}

      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-slate-500">
          {changedCount > 0 ? `${changedCount} thay đổi chưa lưu` : "Chưa có thay đổi nào"}
        </span>
        <Button onClick={() => submit(false)} disabled={saveList.isPending || changedCount === 0}>
          {saveList.isPending ? "Đang lưu..." : "Lưu hàng hoá"}
        </Button>
      </div>

      {pending && (
        <Modal title="Cần xác nhận trước khi lưu" onClose={() => setPending(null)}>
          <div className="flex flex-col gap-4">
            {pending.hasHistory.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-medium text-red-700">
                  {shopName} đã từng kiểm kê mấy hàng dưới đây. Ẩn đi thì tồn đầu/cuối kỳ của chúng được tính bằng{" "}
                  <strong>0</strong> ở các phiếu Check Cost lập sau, làm cột chênh lệch sai.
                </p>
                <ul className="list-disc pl-5 text-sm text-red-700">
                  {pending.hasHistory.map((it) => (
                    <li key={it.code}>
                      {it.name} ({it.code})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pending.willBecomeGlobal.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-slate-600">
                  {shopName} đang là quán <strong>cuối cùng</strong> được gán mấy hàng dưới đây, nên bỏ tích xong chúng sẽ
                  hiện ở <strong>MỌI quán</strong> — rộng hơn chứ không hẹp hơn.
                </p>
                <ul className="list-disc pl-5 text-sm text-slate-700">
                  {pending.willBecomeGlobal.map((it) => (
                    <li key={it.code}>
                      {it.name} ({it.code})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPending(null)}>
                Huỷ
              </Button>
              <Button type="button" onClick={() => submit(true)} disabled={saveList.isPending}>
                {saveList.isPending ? "Đang lưu..." : "Vẫn lưu"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
