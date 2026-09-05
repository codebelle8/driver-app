/**
 * 検証で作った操作履歴を、後片付けの最後に消す。
 *
 * **なぜ要るか**
 *   操作履歴はデータベース側の仕組みで自動的に書かれる。検証用の
 *   施設やアカウントを消すと、その「消した」記録がまた1件増える。
 *   後片付けの途中で履歴を消しても、その後の削除が新しい行を作る
 *   ため、必ず取りこぼす。実際に143件が発注元の履歴へ紛れ込んでいた。
 *
 * **record_id で消す**
 *   操作した人（actor_id）で消す方法では足りない。アカウントを
 *   先に消すと actor_id が空になり、以後の行が引っかからなくなる。
 *   触った行の id そのもので消せば、順序に左右されない。
 *
 * **最後に呼ぶ**
 *   施設もアカウントも消し終えてから呼ぶこと。先に呼ぶと、
 *   その後の削除がまた履歴を作る。
 */

/**
 * @param sb  REST を叩く関数（各検査が持っているもの）
 * @param ids 検証で触った行の id。null や undefined は無視する。
 */
export async function purgeAuditLogs(sb, ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (list.length === 0) return 0;

  let gone = 0;
  /*
    まとめて消さず、100件ずつに割る。
    id を並べた条件は URL に載るため、長すぎると弾かれる。
  */
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const r = await sb(`/rest/v1/audit_logs?record_id=in.(${chunk.join(',')})`, {
      method: 'DELETE',
      prefer: 'return=representation',
    });
    if (r.ok) gone += Array.isArray(r.body) ? r.body.length : 0;
  }
  return gone;
}
