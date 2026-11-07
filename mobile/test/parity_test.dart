import 'package:flutter_test/flutter_test.dart';
import 'package:medilink/app/strings.dart';
import 'package:medilink/app/strings_more.dart';
import 'package:medilink/screens/me/money_disputes.dart';

/// v1.1.2: the app shows what the patient dashboard shows (bills, disputes, record and medicine
/// details), in all three languages.
void main() {
  test('amounts read as whole RWF with grouping', () {
    expect(rwf(1200, Strings.en), '1,200 RWF');
    expect(rwf(0, Strings.rw), '0 RWF');
    expect(rwf(1850000, Strings.en), '1,850,000 RWF');
    expect(rwf(1200, Strings.fr), '1 200 RWF');
  });

  test('every bill, dispute and outcome label exists in the three languages', () {
    const keys = [
      'bills', 'disputes', 'disputes.report',
      'bill.open', 'bill.partly_paid', 'bill.paid', 'bill.voided', 'bill.credited',
      'dispute.open', 'dispute.acknowledged', 'dispute.under_review', 'dispute.info_requested',
      'dispute.resolved', 'dispute.escalated', 'dispute.final_decision', 'dispute.closed', 'dispute.reopened',
      'outcome.no_show_reversed', 'outcome.record_corrected', 'outcome.correction_refused', 'outcome.refund',
      'outcome.bill_correction', 'outcome.rebooking', 'outcome.rejected',
      'subject.bill', 'subject.prescription', 'subject.document',
      'freq.od', 'freq.bd', 'freq.tds', 'freq.prn', 'rx.code',
    ];
    for (final s in [Strings.rw, Strings.en, Strings.fr]) {
      for (final key in keys) {
        expect(s.t(key), isNot(key), reason: '${s.code}: $key');
      }
    }
  });
}
