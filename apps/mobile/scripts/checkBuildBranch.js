// Chặn build EAS từ sai nhánh: profile quyết định app gọi database nào, nhánh quyết định code nào được
// đóng gói — build preview/production từ `dev` sẽ đưa code đang dở lên dữ liệu staging/production.
const { execSync } = require("node:child_process");

const required = process.argv[2];
if (!required) {
  console.error("Thiếu tên nhánh: node scripts/checkBuildBranch.js <nhánh>");
  process.exit(1);
}

const git = (args) => execSync(`git ${args}`, { encoding: "utf8" }).trim();
const current = git("rev-parse --abbrev-ref HEAD");

if (current !== required) {
  console.error(`Build này phải chạy trên nhánh "${required}", đang ở "${current}". Chạy: git switch ${required}`);
  process.exit(1);
}

// EAS đóng gói cả file chưa commit — build ra sẽ khác với code đã deploy trên Render.
if (git("status --porcelain")) {
  console.error(`Nhánh "${required}" còn thay đổi chưa commit. Commit hoặc stash trước khi build.`);
  process.exit(1);
}

console.log(`Nhánh "${required}" sạch, bắt đầu build.`);
