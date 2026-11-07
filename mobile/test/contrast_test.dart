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
  // Every text colour on every background it is used on (AA: 4.5:1 for normal text).
  final pairs = <String, (Color, Color)>{
    'ink on page': (Palette.ink, Palette.page),
    'muted on page': (Palette.muted, Palette.page),
    'muted on surface': (Palette.muted, Palette.surface),
    'muted on mint': (Palette.muted, Palette.brandSubtle),
    'muted on skeleton (closed pill)': (Palette.muted, Palette.skeleton),
    'brand on surface': (Palette.brand, Palette.surface),
    'brand on mint': (Palette.brand, Palette.brandSubtle),
    'forest on mint (insurer pills)': (Palette.forest, Palette.brandSubtle),
    'white on brand (buttons)': (Colors.white, Palette.brand),
    'white on pressed brand': (Colors.white, Palette.brandPressed),
    'muted on the band': (Palette.onForestMuted, Palette.forest),
    'muted on raised forest': (Palette.onForestMuted, Palette.forestRaised),
    'forest on accent (here today)': (Palette.forest, Palette.onForestAccent),
    'ochre text on ochre pill': (Palette.ochreText, Palette.ochreSubtle),
    'ochre text on surface': (Palette.ochreText, Palette.surface),
    'ochre on raised forest (your turn)': (Palette.ochre, Palette.forestRaised),
    'danger on danger pill': (Palette.danger, Palette.dangerSubtle),
    'danger on surface': (Palette.danger, Palette.surface),
  };
  for (final MapEntry(key: name, value: (fg, bg)) in pairs.entries) {
    test('contrast: $name', () => expect(contrast(fg, bg), greaterThanOrEqualTo(4.5)));
  }
}
