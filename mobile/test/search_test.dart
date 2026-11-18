import 'package:flutter_test/flutter_test.dart';
import 'package:medilink/data/providers.dart';

void main() {
  test('an insurer typed in any language becomes a filter; the other words stay text', () {
    expect(insurerInText('RAMA kicukiro'), (insurer: 'rama', rest: 'kicukiro'));
    expect(insurerInText('mituweli'), (insurer: 'mutuelle', rest: ''));
    expect(insurerInText('privé  dentist'), (insurer: 'private_other', rest: 'dentist'));
    expect(insurerInText('remera'), (insurer: null, rest: 'remera'));
  });

  test('the search sends the insurer, only-those and the words', () {
    const q = SearchQuery(openNow: true);
    final withInsurer = q.copyWith(insurerCode: 'mmi', insuredOnly: true, q: ' kigali ');
    expect(withInsurer.toJson(), {'open_now': true, 'insurer_code': 'mmi', 'insured_only': true, 'q': 'kigali'});
    // Clearing the insurer keeps the other filters.
    expect(withInsurer.copyWith(insurerCode: null, insuredOnly: false).toJson(), {'open_now': true, 'q': 'kigali'});
    expect(q.copyWith(emergency: true).insurerCode, isNull);
  });
}
