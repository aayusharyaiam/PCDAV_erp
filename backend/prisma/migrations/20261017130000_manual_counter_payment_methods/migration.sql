-- Counter collection uses explicit manual methods. Existing legacy payment
-- modes and pending cheque rows remain valid for historical compatibility.

ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_amount_check";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK (
  "receivedAmountMinor" > 0
  AND "changeMinor" >= 0
  AND "currency" = 'INR'
  AND "mode" IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'MANUAL_ELECTRONIC')
  AND (
    ("mode" = 'CASH' AND "tenderedAmountMinor" IS NOT NULL AND "tenderedAmountMinor" >= "receivedAmountMinor" AND "changeMinor" = "tenderedAmountMinor" - "receivedAmountMinor")
    OR ("mode" <> 'CASH' AND "changeMinor" = 0)
  )
);

-- New CHEQUE captures are CAPTURED at the counter. Keep the old
-- PENDING_CHEQUE -> CLEARED transition for rows created before this cutover,
-- and reverse the operational clearing entry for both old cleared and new
-- directly captured cheque rows when they are bounced.
CREATE OR REPLACE FUNCTION journal_payment() RETURNS trigger AS $$
DECLARE captured BOOLEAN;
BEGIN
  captured := CASE
    WHEN TG_OP='INSERT' THEN NEW."status"='CAPTURED'
    ELSE OLD."status"='PENDING_CHEQUE' AND NEW."status"='CLEARED'
  END;
  IF captured THEN
    PERFORM journal_pair(NEW."schoolId",NEW."studentId",coalesce(NEW."captureBusinessDate",NEW."businessDate"),'PAYMENT_CAPTURE',NEW."id",'Recorded counter funds; manual method is not external settlement',CASE WHEN NEW."mode"='CASH' THEN 'CASH' ELSE 'BANK_CLEARING' END,'STUDENT_CREDIT',NEW."receivedAmountMinor");
  END IF;
  IF TG_OP='UPDATE' AND OLD."status" IN ('CAPTURED','CLEARED') AND NEW."status"='BOUNCED' THEN
    PERFORM journal_pair(NEW."schoolId",NEW."studentId",finance_event_date(NEW."schoolId"),'CHEQUE_BOUNCE',NEW."id",'Return recorded cheque','STUDENT_CREDIT','BANK_CLEARING',NEW."receivedAmountMinor");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
