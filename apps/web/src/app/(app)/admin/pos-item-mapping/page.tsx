"use client";

import { PosMappingEditor } from "@/components/posSales/PosMappingEditor";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useDeletePosItemMapping, usePosItemMappings, useSuggestPosMappings } from "@/hooks/usePosSales";
import { Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

const cellClass = "border border-slate-200 px-3 py-2 align-top";
const headClass = "border border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase text-slate-500";

export default function PosItemMappingPage() {
  const { data: mappings = [], isLoading } = usePosItemMappings();
  const deleteMapping = useDeletePosItemMapping();
  const suggest = useSuggestPosMappings();

  // Danh sách tên POS đang chờ ánh xạ, dán từ thông báo của màn nhập doanh số — mỗi dòng một tên.
  const [pendingText, setPendingText] = useState("");
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const pendingNames = useMemo(
    () => [...new Set(pendingText.split("\n").map((line) => line.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [pendingText],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Ánh xạ món POS</h1>
        <p className="text-sm text-slate-500">
          Tên món trên POS thường khác danh mục Đồ thành phẩm (viết tắt, size, dấu), nên phải khai một lần rồi dùng mãi.
          Thường thì bạn <strong>ánh xạ ngay trong hộp thoại nhập doanh số</strong> — trang này để khai trước hoặc sửa lại
          những ánh xạ đã lưu.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Khai trước một danh sách tên</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600">Tên món trên POS — mỗi dòng một tên</label>
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            placeholder={"Bạc Xỉu (L)\nCF sữa đá\nPhí ship"}
            value={pendingText}
            onChange={(e) => setPendingText(e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => suggest.mutate(pendingNames)}
            disabled={suggest.isPending || pendingNames.length === 0}
          >
            <Wand2 size={14} />
            {suggest.isPending ? "Đang tìm..." : `Gợi ý món cho ${pendingNames.length} tên`}
          </Button>
          <PosMappingEditor
            posNames={pendingNames}
            suggestions={suggest.data}
            suggesting={suggest.isPending}
            saveLabel="Lưu ánh xạ"
            onSaved={(saved) => {
              setSavedCount(saved.length);
              const done = new Set(saved);
              setPendingText(pendingNames.filter((name) => !done.has(name)).join("\n"));
            }}
          />
          {savedCount !== null && <p className="text-sm text-green-600">Đã lưu {savedCount} ánh xạ.</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ánh xạ đã lưu ({mappings.length})</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-slate-400">Đang tải...</p>
          ) : mappings.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có ánh xạ nào.</p>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={headClass}>Tên trên POS</th>
                  <th className={headClass}>Khoá tra cứu</th>
                  <th className={headClass}>Ánh xạ tới</th>
                  <th className={headClass}></th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => (
                  <tr key={mapping.id}>
                    <td className={cellClass}>{mapping.posNameRaw}</td>
                    <td className={`${cellClass} font-mono text-xs text-slate-400`}>{mapping.posName}</td>
                    <td className={cellClass}>
                      {mapping.finishedGoodItem ? (
                        `${mapping.finishedGoodItem.name} (${mapping.finishedGoodItem.code})`
                      ) : (
                        <span className="text-slate-400">Bỏ qua — không phải món</span>
                      )}
                    </td>
                    <td className={cellClass}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => deleteMapping.mutate(mapping.id)}
                        disabled={deleteMapping.isPending}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-slate-400">
        Khoá tra cứu là tên đã bỏ dấu và hạ chữ thường — hai tên POS chỉ khác dấu hoặc hoa thường sẽ trỏ về cùng một ánh
        xạ. Xoá một ánh xạ nghĩa là tên đó quay về &quot;chưa ánh xạ&quot; và sẽ chặn lần nhập tiếp theo.
      </p>
    </div>
  );
}
