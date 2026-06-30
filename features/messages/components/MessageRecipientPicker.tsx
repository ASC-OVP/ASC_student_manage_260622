
export type MessageRecipientPickerProps = { selectedStudentIds?: string[] };

export default function MessageRecipientPicker({ selectedStudentIds = [] }: MessageRecipientPickerProps) {
  return <input name="studentIds" defaultValue={selectedStudentIds.join(",")} />;
}
