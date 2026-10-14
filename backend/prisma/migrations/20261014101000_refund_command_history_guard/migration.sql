-- Idempotency replay records are evidence of the original refund command and
-- result; changing them would make a retry return a different financial result.
CREATE TRIGGER "RefundCommand_immutable"
BEFORE UPDATE OR DELETE ON "RefundCommand"
FOR EACH ROW EXECUTE FUNCTION finance_immutable();
