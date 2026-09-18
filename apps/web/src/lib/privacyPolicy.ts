/**
 * Thông tin và cam kết xử lý yêu cầu xoá do người vận hành xác nhận.
 * Khi thay đổi cách xử lý dữ liệu, rà lại nội dung ở page.tsx và ngày cập nhật.
 */
export const privacyPolicy = {
  operatorName: "Trương Thái",
  contactEmail: "truongthaici1@gmail.com",
  updatedAt: "18/09/2026",
  reviewed: true,
};

export const privacyPolicyIsDraft = !privacyPolicy.reviewed || !privacyPolicy.operatorName || !privacyPolicy.contactEmail;
