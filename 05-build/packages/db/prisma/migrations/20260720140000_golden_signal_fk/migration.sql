-- [F162] FK ai_golden_candidate.signal_id → ai_learning_signal.id — cho phép harvest
-- lọc "tín hiệu CHƯA có candidate" ngay trong query (hết starvation cửa sổ 2000)
-- + toàn vẹn tham chiếu (candidate không trỏ tín hiệu ma).

-- AddForeignKey
ALTER TABLE "ai_golden_candidate" ADD CONSTRAINT "ai_golden_candidate_signal_id_fkey"
  FOREIGN KEY ("signal_id") REFERENCES "ai_learning_signal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
