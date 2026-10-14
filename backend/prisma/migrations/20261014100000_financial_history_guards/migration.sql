-- Preserve all posted payment and correction lineage, not only the Level 4
-- credit-allocation tables. These rows are the evidence used to derive
-- balances and journal conservation; corrections append new rows instead.
CREATE TRIGGER "PaymentAllocation_immutable"
BEFORE UPDATE OR DELETE ON "PaymentAllocation"
FOR EACH ROW EXECUTE FUNCTION finance_immutable();

CREATE TRIGGER "PaymentAllocationRelease_immutable"
BEFORE UPDATE OR DELETE ON "PaymentAllocationRelease"
FOR EACH ROW EXECUTE FUNCTION finance_immutable();

CREATE TRIGGER "PaymentCreditApplication_immutable"
BEFORE UPDATE OR DELETE ON "PaymentCreditApplication"
FOR EACH ROW EXECUTE FUNCTION finance_immutable();

CREATE TRIGGER "PaymentCreditRelease_immutable"
BEFORE UPDATE OR DELETE ON "PaymentCreditRelease"
FOR EACH ROW EXECUTE FUNCTION finance_immutable();

CREATE TRIGGER "PaymentRefund_immutable"
BEFORE UPDATE OR DELETE ON "PaymentRefund"
FOR EACH ROW EXECUTE FUNCTION finance_immutable();

CREATE TRIGGER "PaymentEvent_immutable"
BEFORE UPDATE OR DELETE ON "PaymentEvent"
FOR EACH ROW EXECUTE FUNCTION finance_immutable();
