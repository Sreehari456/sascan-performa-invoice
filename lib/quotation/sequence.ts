import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Next quotation sequence number for a financial year (highest existing + 1).
 * This is only a preview: the unique constraint on
 * (financial_year, document_type, sequence_no) is what prevents duplicates,
 * and saving retries with a fresh number if another quotation took this one.
 */
export async function fetchNextSequenceNo(
  supabase: SupabaseClient,
  financialYear: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("invoices")
    .select("sequence_no")
    .eq("document_type", "quotation")
    .eq("financial_year", financialYear)
    .not("sequence_no", "is", null)
    .order("sequence_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.sequence_no ?? 0) + 1;
}
