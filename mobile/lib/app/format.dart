import 'strings.dart';

const _monthsRw = [
  'Mutarama', 'Gashyantare', 'Werurwe', 'Mata', 'Gicurasi', 'Kamena', //
  'Nyakanga', 'Kanama', 'Nzeri', 'Ukwakira', 'Ugushyingo', 'Ukuboza',
];
const _monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _daysRw = [
  'Ku wa mbere', 'Ku wa kabiri', 'Ku wa gatatu', 'Ku wa kane', //
  'Ku wa gatanu', 'Ku wa gatandatu', 'Ku cyumweru',
];
const _daysEn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _daysEnFull = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/// The full name of a weekday, Monday = 0.
String weekday(int index, Strings s) => (s.code == 'rw' ? _daysRw : _daysEnFull)[index % 7];

String two(int n) => n.toString().padLeft(2, '0');

/// 24-hour time, as used in Rwanda.
String time(DateTime d) => '${two(d.hour)}:${two(d.minute)}';

/// "Tue 12 Nov" / "Ku wa kabiri 12 Ugushyingo"; "Today" when it is today.
String day(DateTime d, Strings s, {bool relative = true}) {
  final now = DateTime.now();
  if (relative && d.year == now.year && d.month == now.month && d.day == now.day) return s.today;
  final rw = s.code == 'rw';
  final weekday = (rw ? _daysRw : _daysEn)[d.weekday - 1];
  final month = (rw ? _monthsRw : _monthsEn)[d.month - 1];
  final year = d.year == now.year ? '' : ' ${d.year}';
  return '$weekday ${d.day} $month$year';
}

String dayShort(DateTime d, Strings s) {
  final rw = s.code == 'rw';
  return '${d.day} ${(rw ? _monthsRw : _monthsEn)[d.month - 1]}';
}

String monthShort(DateTime d, Strings s) {
  final name = (s.code == 'rw' ? _monthsRw : _monthsEn)[d.month - 1];
  return name.substring(0, 3).toUpperCase();
}

/// "12–20 min" from an estimate; null when unknown.
String? waitRange(int? min, int? max, Strings s) {
  if (min == null && max == null) return null;
  if (min != null && max != null && min != max) return '$min–$max ${s.minutes}';
  return '${max ?? min} ${s.minutes}';
}
