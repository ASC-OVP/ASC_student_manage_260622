
import { userRoleLabel } from "@/features/users/lib/userRoles";

type Props = { role: string };

export default function UserRoleBadge({ role }: Props) {
  return <span>{userRoleLabel(role)}</span>;
}
