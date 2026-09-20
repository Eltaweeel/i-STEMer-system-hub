import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { isLocale } from '../../../../lib/auth/redirects';
import { readTenantAccess } from '../../../../lib/auth/tenant';
import { logout } from '../../../../lib/auth/actions';
import { readResearchAuthorization } from '../../../../lib/workflow/authorization';
import { WorkflowBriefForm } from './WorkflowBriefForm';
import { UsageAllowancePanel } from './UsageAllowancePanel';

export default async function TenantPage({ params }: { params: Promise<{ locale: string; tenantId: string }> }) {
  const { locale, tenantId } = await params;
  if (!isLocale(locale)) notFound();
  const access = await readTenantAccess(tenantId);
  if (access.status === 'signed-out') redirect(`/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/t/${tenantId}`)}`);
  const ar = locale === 'ar';
  const researchAccess = access.status === 'authorized' ? await readResearchAuthorization() : null;
  return <>
    <h1>{ar ? 'الوصول إلى المؤسسة' : 'Organization access'}</h1>
    {access.status === 'authorized' ? <><h2>{access.name}</h2><p>{ar ? 'تم التحقق من هويتك وعضويتك الحالية.' : 'Your identity and current membership are verified.'}</p>{researchAccess?.status === 'authorized' && researchAccess.tenantId === tenantId ? <><UsageAllowancePanel ar={ar} tenantId={tenantId} /><WorkflowBriefForm locale={locale} /></> : <p role="alert">{researchAccess?.status === 'mfa-required' ? (ar ? 'يتطلب سير عمل البحث جلسة تحقق بخطوتين.' : 'The research workflow requires a session verified with MFA.') : (ar ? 'سير عمل البحث غير متاح حاليًا لهذه المؤسسة.' : 'The research workflow is not available for this organization right now.')}</p>}</> : <p role="alert">{access.status === 'mfa-required' ? (ar ? 'يتطلب وصول المالك جلسة تحقق بخطوتين. لم يتم تحميل بيانات المؤسسة. تواصل مع المسؤول لإعداد الوصول.' : 'Owner access requires a session verified with MFA. Organization data has not been loaded. Contact your administrator to arrange access.') : access.status === 'setup-needed' ? (ar ? 'الوصول يحتاج إلى إعداد من المسؤول.' : 'Access needs administrator configuration.') : (ar ? 'تعذر التحقق من الوصول. لم يتم تحميل بيانات المؤسسة.' : 'Access could not be verified. Organization data has not been loaded.')}</p>}
    {access.status === 'mfa-required' && <p><Link href={`/${locale}/auth/mfa?next=${encodeURIComponent(`/${locale}/t/${tenantId}`)}`}>{ar ? 'إعداد أو تأكيد التحقق بخطوتين' : 'Set up or verify MFA'}</Link></p>}
    <p><Link href={`/${locale}/auth/login`}>{ar ? 'إدارة الجلسة' : 'Manage session'}</Link></p>
    <form action={logout}><input type="hidden" name="locale" value={locale} /><button type="submit">{ar ? 'تسجيل الخروج' : 'Sign out'}</button></form>
  </>;
}
