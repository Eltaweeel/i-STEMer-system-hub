// Renders only what a persisted run actually attests. `liveEffects` is
// carried on every *RunView the read modules return; this banner reads that
// field rather than asserting the staging claim unconditionally.
export function NoLiveEffectsBanner({ ar, liveEffects }: { ar: boolean; liveEffects: boolean }) {
  if (liveEffects) return null;
  return (
    <p role="status">
      {ar
        ? 'بيئة تجريبية: لا يوجد نشر خارجي فعلي ولا إرسال رسائل في أي مرحلة من هذه السلسلة.'
        : 'Staging environment: no external publication or message send occurs at any stage of this chain.'}
    </p>
  );
}
