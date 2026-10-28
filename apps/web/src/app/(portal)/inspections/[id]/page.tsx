import { InspectionRunner } from '../../../../features/inspection-runner/inspection-runner';
import { requireSession } from '../../../../lib/session';
export const metadata = { title: 'Preenchimento da inspeção | Portal de Segurança' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  return <InspectionRunner inspectionId={id} />;
}
