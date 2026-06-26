import { defaultOperationalMessageTemplates } from "@/lib/sms/defaultTemplates";
import { prisma } from "@/lib/prisma";

export async function ensureDefaultMessageTemplates(academyId: string, createdById: string) {
  const templateCount = await prisma.messageTemplate.count({
    where: { academyId },
  });
  if (templateCount > 0) return false;

  await prisma.messageTemplate.createMany({
    data: defaultOperationalMessageTemplates.map((template) => ({
      academyId,
      createdById,
      name: template.name,
      category: template.category,
      targetType: template.targetType,
      body: template.body,
      isActive: true,
    })),
  });

  return true;
}
