import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medilink/app/theme.dart';

/// WCAG contrast ratio of two opaque colours.
double contrast(Color a, Color b) {
  final la = a.computeLuminance(), lb = b.computeLuminance();
  final hi = la > lb ? la : lb, lo = la > lb ? lb : la;
  return (hi + 0.05) / (lo + 0.05);
}

void main() {
  for (final dark in [false, true]) {
    group(dark ? 'dark' : 'light', () {
      setUp(() => Palette.dark = dark);
      tearDown(() => Palette.dark = false);
      _pairs();
    });
  }
}

void _pairs() {
  // Every text colour on every background it is used on (AA: 4.5:1 for normal text).
  // Built lazily so each mode reads its own colours.
  Map<String, (Color, Color)> pairs() => <String, (Color, Color)>{
    'ink on page': (Palette.ink, Palette.page),
    'muted on page': (Palette.muted, Palette.page),
    'muted on surface': (Palette.muted, Palette.surface),
    'muted on mint': (Palette.muted, Palette.brandSubtle),
    'muted on skeleton (closed pill)': (Palette.muted, Palette.skeleton),
    'brand on surface': (Palette.brand, Palette.surface),
    'brand on mint': (Palette.brand, Palette.brandSubtle),
    'text on brand (buttons)': (Palette.onBrand, Palette.brand),
    'text on pressed brand': (Palette.onBrand, Palette.brandPressed),
    'text on danger (danger buttons)': (Palette.onDanger, Palette.danger),
    'forest ink on surface (ticket number)': (Palette.forestInk, Palette.surface),
    'forest ink on mint (insurer pills)': (Palette.forestInk, Palette.brandSubtle),
    'white on the band': (Colors.white, Palette.forest),
    'forest on ochre (your turn)': (Palette.forest, Palette.ochre),
    'muted on the band': (Palette.onForestMuted, Palette.forest),
    'muted on raised forest': (Palette.onForestMuted, Palette.forestRaised),
    'forest on accent (here today)': (Palette.forest, Palette.onForestAccent),
    'ochre text on ochre pill': (Palette.ochreText, Palette.ochreSubtle),
    'ochre text on surface': (Palette.ochreText, Palette.surface),
    'ochre on raised forest (your turn)': (Palette.ochre, Palette.forestRaised),
    'danger on danger pill': (Palette.danger, Palette.dangerSubtle),
    'danger on surface': (Palette.danger, Palette.surface),
  };
  for (final name in pairs().keys) {
    test('contrast: $name', () {
      final (fg, bg) = pairs()[name]!;
      expect(contrast(fg, bg), greaterThanOrEqualTo(4.5));
    });
  }
}
