/**
 * 運営者の情報と、規約類の掲載先。
 *
 * **文面は持たない。掲載先だけを持つ。**
 *   要件（docs/01-client-requirements.md C-2）で「掲載先URL」を
 *   いただく取り決めになっている。文面をアプリの中に抱えると、
 *   直すたびに配り直しになる。
 *
 * **空の項目は出さない。**
 *   押しても何も無いリンクは、壊れているのと同じ。
 */
import Constants from 'expo-constants';

import { supabase } from './supabase';

export interface Site {
  operatorName: string | null;
  contactEmail: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  lawUrl: string | null;
}

interface Row {
  operator_name: string | null;
  contact_email: string | null;
  terms_url: string | null;
  privacy_url: string | null;
  law_url: string | null;
}

/** 掲載先を読む。ログインしていなければ null。 */
export async function loadSite(): Promise<Site | null> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('operator_name, contact_email, terms_url, privacy_url, law_url')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Row;
  return {
    operatorName: row.operator_name,
    contactEmail: row.contact_email,
    termsUrl: row.terms_url,
    privacyUrl: row.privacy_url,
    lawUrl: row.law_url,
  };
}

/** 何か1つでも入っているか。全部空なら、節ごと出さない。 */
export function hasAny(site: Site | null): site is Site {
  if (!site) return false;
  return Boolean(site.termsUrl || site.privacyUrl || site.lawUrl || site.contactEmail);
}

/**
 * このアプリの版。
 *
 * 不具合のご連絡をいただいたときに、どの版のことかが分かる。
 * 「直したはずのものが直っていない」の多くは、古い版のままで
 * 開いていることによる。
 */
export function appVersion(): string {
  const v = Constants.expoConfig?.version;
  return v && v.trim() !== '' ? v : '—';
}
