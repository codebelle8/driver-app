/**
 * 試験提供の期間（site_settings.trial_open。2026-10-07）を検査で切り替える。
 *
 * **本番の全体に効く切り替え。** 外しているあいだ、無料期間が過ぎた本物の
 * 会員は設定の画面などにしか入れなくなる。検査で外す前に、そうなる本物の
 * 会員がいないかを数え、いれば外さない（その検査は飛ばす）。外したら、
 * 検査が途中で止まっても必ず戻す（呼ぶ側の finally で restoreTrial）。
 */

/** いまの値。列が無ければ（データベースの更新前）null */
export async function getTrialOpen({ url, svc }) {
  const r = await fetch(`${url}/rest/v1/site_settings?select=trial_open&id=eq.1`, { headers: svc });
  const b = await r.json().catch(() => null);
  return Array.isArray(b) && typeof b[0]?.trial_open === 'boolean' ? b[0].trial_open : null;
}

export async function setTrialOpen({ url, svc }, open) {
  /*
    外すと、データベースが「無料期間を過ぎた方に1か月」を付け、操作履歴に1行
    残す（20261012000001。検査では対象 0 名）。検査が残したその行は消す
    （発注元の操作履歴に、検査の跡を混ぜない）。
  */
  const newest = async () => {
    const q = await fetch(`${url}/rest/v1/audit_logs?select=id&order=id.desc&limit=1`, { headers: svc });
    return (await q.json().catch(() => []))?.[0]?.id ?? 0;
  };
  const before = open ? 0 : await newest();
  const r = await fetch(`${url}/rest/v1/site_settings?id=eq.1`, {
    method: 'PATCH',
    headers: svc,
    body: JSON.stringify({ trial_open: open }),
  });
  if (!open && r.ok) {
    await fetch(`${url}/rest/v1/audit_logs?id=gt.${before}&table_name=eq.site_settings&actor_id=is.null`, {
      method: 'DELETE',
      headers: svc,
    });
  }
  return r.ok;
}

/**
 * 試験提供を外すと絞られる、本物の会員の数。
 *
 * 期限（お支払い済みならその期間、そうでなければ無料期間）が過ぎていて、
 * 止められておらず、期限なしの無料（調査員・所有者）でもない方。
 * exclude には検査用の会員の id を渡す。
 */
export async function wouldLockReal({ url, svc }, exclude = []) {
  const r = await fetch(`${url}/rest/v1/driver_profiles?select=user_id,status,trial_ends_at,paid_until`, {
    headers: svc,
  });
  const rows = (await r.json().catch(() => [])) ?? [];
  const now = Date.now();
  let n = 0;
  for (const p of rows) {
    if (exclude.includes(p.user_id) || p.status === 'blocked') continue;
    const end = p.status === 'active' ? p.paid_until : p.trial_ends_at;
    if (!end || new Date(end).getTime() > now) continue;
    const fr = await fetch(`${url}/rest/v1/rpc/free_reason_of`, {
      method: 'POST',
      headers: svc,
      body: JSON.stringify({ p_user: p.user_id }),
    });
    const reason = await fr.json().catch(() => null);
    if (reason) continue;
    n++;
  }
  return n;
}

/**
 * 検査のあいだだけ、有料の提供のときの姿にする（試験提供を外す）。
 *
 * 締め出しや期限切れを確かめる検査は、試験提供の期間中は成り立たない
 * （だれも締め出されない）。外すと絞られる本物の会員がいれば、外さずに
 * 止める。戻り値の関数を finally で必ず呼ぶ（元の値へ戻す）。
 */
export async function paidModeForTest(conn) {
  const before = await getTrialOpen(conn);
  if (before) {
    const real = await wouldLockReal(conn);
    if (real > 0) throw new Error(`試験提供を外すと絞られる本物の会員が ${real} 名いるため、検査しない`);
    await setTrialOpen(conn, false);
  }
  return async () => {
    if (before !== null && (await getTrialOpen(conn)) !== before) {
      const back = await setTrialOpen(conn, before);
      console.log(`  試験提供の期間を元（${before}）に戻した: ${back ? 'はい' : 'いいえ（要確認）'}`);
    }
  };
}
