import OmrUploadReviewPageView from "@/features/omr/components/OmrUploadReviewPageView";

type Props = {
  params: Promise<{ uploadId: string }>;
};

export const dynamic = "force-dynamic";

export default function OmrUploadReviewPage(props: Props) {
  return <OmrUploadReviewPageView {...props} />;
}
