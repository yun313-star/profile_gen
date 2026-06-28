export type JobErrorView = {
  title: string;
  message: string;
  refunded: boolean;
  canRetry: boolean;
};

export function describeJobError(errorCode: string | null): JobErrorView {
  switch (errorCode) {
    case "moderation_blocked":
      return {
        title: "이미지를 생성하지 못했어요",
        message:
          "업로드하신 사진이 안전 정책에 의해 생성이 제한되었어요. 얼굴이 선명하게 보이는 본인 사진으로 다시 시도해 주세요. 차감된 크레딧은 자동으로 환불되었습니다.",
        refunded: true,
        canRetry: true,
      };
    case "no_image":
      return {
        title: "결과 이미지를 받지 못했어요",
        message:
          "일시적인 문제로 이미지가 생성되지 않았어요. 같은 사진으로 다시 시도해 주세요. 차감된 크레딧은 환불되었습니다.",
        refunded: true,
        canRetry: true,
      };
    case "generation_failed":
      return {
        title: "생성 중 문제가 발생했어요",
        message:
          "이미지 생성 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요. 차감된 크레딧은 환불되었습니다.",
        refunded: true,
        canRetry: true,
      };
    default:
      return {
        title: "생성 중 문제가 발생했어요",
        message:
          "잠시 후 다시 시도해 주세요. 차감된 크레딧은 환불되었습니다. 문제가 계속되면 고객센터로 문의해 주세요.",
        refunded: true,
        canRetry: true,
      };
  }
}
