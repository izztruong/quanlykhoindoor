"use client";

import { FinishedGoodMenuTab } from "@/components/shopMenus/FinishedGoodMenuTab";
import { ProductShopTab } from "@/components/shopMenus/ProductShopTab";
import { Card, CardBody } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useUserOptions } from "@/hooks/useUsers";
import { useState } from "react";

type Tab = "finished" | "products";

const TABS: { key: Tab; label: string }[] = [
  { key: "finished", label: "Đồ thành phẩm" },
  { key: "products", label: "Nguyên liệu" },
];

/**
 * Gán menu món và danh sách nguyên liệu cho từng quán.
 *
 * Hai tab dùng CHUNG ô chọn quán: cùng một thao tác của người dùng ("dựng danh sách cho quán này"),
 * tách thành hai trang là bắt chọn quán hai lần.
 *
 * Quy ước nói rõ trên màn vì nó trái trực giác: thứ chưa gán quán nào thì hiện ở MỌI quán.
 */
export default function ShopMenusPage() {
  const { data: shops = [] } = useUserOptions();
  const [shopUserId, setShopUserId] = useState("");
  const [tab, setTab] = useState<Tab>("finished");

  const shopName = shops.find((s) => s.id === shopUserId)?.name ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Menu &amp; nguyên liệu theo quán</h1>
        <p className="text-sm text-slate-500">
          Chọn món và nguyên liệu mà từng quán thực sự dùng, để phiếu kiểm kê và phiếu huỷ của quán chỉ còn dòng của quán
          đó. Thứ <strong>chưa gán quán nào thì mọi quán đều thấy</strong> — chỉ khi được gán cho ít nhất một quán thì các
          quán còn lại mới không thấy nó nữa.
        </p>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Quán</label>
            <Select value={shopUserId} onChange={(e) => setShopUserId(e.target.value)}>
              <option value="">Chọn quán</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      {shopUserId && (
        <>
          <div className="flex gap-1 border-b border-slate-200">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={
                  tab === t.key
                    ? "border-b-2 border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-600"
                    : "border-b-2 border-transparent px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* key theo quán: đổi quán phải reset hết ô tích đang soạn dở của tab, không mang sang quán khác. */}
          {tab === "finished" ? (
            <FinishedGoodMenuTab key={`fg-${shopUserId}`} shopUserId={shopUserId} shopName={shopName} />
          ) : (
            <ProductShopTab key={`ps-${shopUserId}`} shopUserId={shopUserId} shopName={shopName} />
          )}
        </>
      )}
    </div>
  );
}
