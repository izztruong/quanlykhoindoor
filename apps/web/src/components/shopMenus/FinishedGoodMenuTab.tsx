"use client";

import { Pagination } from "@/components/data-table/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useFinishedGoodItems } from "@/hooks/useCatalog";
import {
  type FinishedGoodMenuItemInput,
  type WillBecomeGlobalItem,
  readWillBecomeGlobal,
  useFinishedGoodMenu,
  useSaveFinishedGoodMenu,
} from "@/hooks/useFinishedGoodMenus";
import { ApiError } from "@/lib/api-client";
import type { FinishedGoodCategory } from "@/types";
import { useMemo, useState } from "react";

const CATEGORY_LABELS: Record<FinishedGoodCategory, string> = {
  TRA: "Trà",
  DAV: "Đồ ăn vặt",
  THANH_PHAM: "Đồ pha sẵn",
};

function categoryLabel(category: FinishedGoodCategory | null | undefined): string {
  return category ? CATEGORY_LABELS[category] : "Chưa phân loại";
}

/**
 * Tab gán MÓN (đồ thành phẩm) cho một quán.
 *
 * Quy ước: món không được gán cho quán nào thì hiện ở MỌI quán. Hệ quả trái trực giác là bỏ tích
 * quán cuối cùng NỚI RỘNG phạm vi món đó — server trả 409 kèm danh sách để hỏi lại.
 */
export function FinishedGoodMenuTab({ shopUserId, shopName }: { shopUserId: string; shopName: string }) {
  // Không truyền quán: tab này phải thấy TOÀN BỘ danh mục để gán được.
  const { data: items = [], isLoading } = useFinishedGoodItems();
  const { data: assignedIds = [] } = useFinishedGoodMenu(shopUserId);
  const saveMenu = useSaveFinishedGoodMenu();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  /** Chỉ những ô người dùng đã bấm trong lượt này; dòng chưa chạm lấy theo dữ liệu đã lưu. */
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pendingGlobal, setPendingGlobal] = useState<WillBecomeGlobalItem[] | null>(null);

  const assignedSet = useMemo(() => new Set(assignedIds), [assignedIds]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((it) => {
      if (category && (it.category ?? "") !== category) return false;
      if (!term) return true;
      return it.name.toLowerCase().includes(term) || it.code.toLowerCase().includes(term);
    });
  }, [items, search, category]);

  const pageItems = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  function isAssigned(id: string): boolean {
    return overrides[id] ?? assignedSet.has(id);
  }

  function toggle(id: string, value: boolean) {
    setSaved(false);
    setOverrides((prev) => ({ ...prev, [id]: value }));
  }

  /** Tích/bỏ tích trọn trang đang hiện — gán cả menu từng ô một thì quá lâu. */
  function toggleVisible(value: boolean) {
    setSaved(false);
    setOverrides((prev) => {
      const next = { ...prev };
      for (const it of pageItems) next[it.id] = value;
      return next;
    });
  }

  /** Chỉ gửi dòng KHÁC với trạng thái đã lưu, cùng lý do như trang Định lượng Order nhanh. */
  function buildItems(): FinishedGoodMenuItemInput[] {
    const validIds = new Set(items.map((it) => it.id));
    return Object.entries(overrides)
      .filter(([id, assigned]) => validIds.has(id) && assigned !== assignedSet.has(id))
      .map(([finishedGoodItemId, assigned]) => ({ finishedGoodItemId, assigned }));
  }

  function submit(confirmGlobal: boolean) {
    const payloadItems = buildItems();
    if (payloadItems.length === 0) {
      setPendingGlobal(null);
      setSaved(true);
      return;
    }
    setError(null);
    setSaved(false);
    saveMenu.mutate(
      { shopUserId, items: payloadItems, confirmGlobal },
      {
        onSuccess: () => {
          setOverrides({});
          setPendingGlobal(null);
          setSaved(true);
        },
        onError: (err) => {
          const willBecomeGlobal = readWillBecomeGlobal(err);
          if (err instanceof ApiError && err.status === 409 && willBecomeGlobal.length > 0) {
            setPendingGlobal(willBecomeGlobal);
            return;
          }
          setPendingGlobal(null);
          setError(err instanceof ApiError ? err.message : "Lưu menu thất bại");
        },
      },
    );
  }

  const changedCount = buildItems().length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Món của {shopName}</CardTitle>
          <div className="flex gap-2">
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
              placeholder="Tìm theo tên hoặc mã món..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="max-w-sm"
            />
            <Select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="max-w-[12rem]"
            >
              <option value="">Tất cả loại</option>
              <option value="TRA">Trà</option>
              <option value="DAV">Đồ ăn vặt</option>
              <option value="THANH_PHAM">Đồ pha sẵn</option>
            </Select>
          </div>

          <div className="overflow-x-auto px-4">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500">
                  <th className="w-20 border border-slate-200 px-3 py-2">Có ở quán</th>
                  <th className="border border-slate-200 px-3 py-2">Mã</th>
                  <th className="border border-slate-200 px-3 py-2">Tên món</th>
                  <th className="border border-slate-200 px-3 py-2">Loại</th>
                  <th className="border border-slate-200 px-3 py-2">Phạm vi hiện tại</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td className="border border-slate-200 px-3 py-4 text-slate-400" colSpan={5}>
                      Đang tải...
                    </td>
                  </tr>
                )}
                {!isLoading && pageItems.length === 0 && (
                  <tr>
                    <td className="border border-slate-200 px-3 py-4 text-slate-400" colSpan={5}>
                      Không có món nào khớp bộ lọc.
                    </td>
                  </tr>
                )}
                {pageItems.map((it) => {
                  const shopCount = it.shops?.length ?? 0;
                  return (
                    <tr key={it.id}>
                      <td className="border border-slate-200 px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={isAssigned(it.id)}
                          onChange={(e) => toggle(it.id, e.target.checked)}
                        />
                      </td>
                      <td className="border border-slate-200 px-3 py-2">{it.code}</td>
                      <td className="border border-slate-200 px-3 py-2">{it.name}</td>
                      <td className="border border-slate-200 px-3 py-2">{categoryLabel(it.category)}</td>
                      <td className="border border-slate-200 px-3 py-2">
                        {shopCount === 0 ? (
                          <Badge tone="yellow">Mọi quán</Badge>
                        ) : (
                          <span className="text-slate-600">Đang gán cho {shopCount} quán</span>
                        )}
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
      {saved && !error && <p className="text-sm text-green-600">Đã lưu menu.</p>}

      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-slate-500">
          {changedCount > 0 ? `${changedCount} thay đổi chưa lưu` : "Chưa có thay đổi nào"}
        </span>
        <Button onClick={() => submit(false)} disabled={saveMenu.isPending || changedCount === 0}>
          {saveMenu.isPending ? "Đang lưu..." : "Lưu menu món"}
        </Button>
      </div>

      {pendingGlobal && (
        <Modal title="Món sẽ hiện ở mọi quán" onClose={() => setPendingGlobal(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              {shopName} đang là quán <strong>cuối cùng</strong> được gán mấy món dưới đây. Bỏ tích xong, món không còn gán
              cho quán nào nên sẽ hiện ở <strong>MỌI quán</strong> — rộng hơn chứ không hẹp hơn.
            </p>
            <ul className="list-disc pl-5 text-sm text-slate-700">
              {pendingGlobal.map((it) => (
                <li key={it.code}>
                  {it.name} ({it.code})
                </li>
              ))}
            </ul>
            <p className="text-sm text-slate-500">
              Muốn món chỉ ở một vài quán thì gán nó cho những quán đó trước, rồi mới bỏ tích ở đây.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPendingGlobal(null)}>
                Huỷ
              </Button>
              <Button type="button" onClick={() => submit(true)} disabled={saveMenu.isPending}>
                {saveMenu.isPending ? "Đang lưu..." : "Vẫn lưu"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
