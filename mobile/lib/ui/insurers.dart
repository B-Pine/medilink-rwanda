import 'package:flutter/material.dart';

import '../app/strings.dart';
import '../app/strings_more.dart';
import '../app/theme.dart';
import 'icons.dart';

/// Short insurer names, the same as the website's cards (U-01: only whether it is accepted,
/// never a price or share).
String insurerName(String code, Strings s) => switch (code) {
      'mutuelle' => 'Mutuelle',
      'rama' => 'RAMA',
      'mmi' => 'MMI',
      'private_other' => s.t('privateInsurance'),
      _ => code.isEmpty ? code : code.replaceAll('_', ' ').toUpperCase(),
    };

/// Accepted insurers as small pills with a shield; "+2" when more than [max].
class InsurerPills extends StatelessWidget {
  const InsurerPills({super.key, required this.codes, this.max = 3, this.wrap = false});

  final List<String> codes;
  final int max;

  /// Wrap onto more lines (facility page) instead of one clipped line (cards).
  final bool wrap;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    if (codes.isEmpty) {
      return Row(
        children: [
          const Icon(PhosphorIconsRegular.shieldCheck, size: 15, color: Palette.muted),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              s.t('noInsuranceListed'),
              style: theme.textTheme.labelSmall?.copyWith(color: Palette.muted),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      );
    }
    final shown = wrap ? codes : codes.take(max).toList();
    final more = codes.length - shown.length;
    final pills = [
      for (final code in shown) _Pill(text: insurerName(code, s)),
      if (more > 0) _Pill(text: '+$more', quiet: true),
    ];
    if (wrap) return Wrap(spacing: Space.sm, runSpacing: Space.sm, children: pills);
    return Row(
      children: [
        const Icon(PhosphorIconsRegular.shieldCheck, size: 15, color: Palette.brand),
        const SizedBox(width: 6),
        Expanded(
          child: ClipRect(
            child: Wrap(spacing: 4, runSpacing: 4, clipBehavior: Clip.hardEdge, children: pills),
          ),
        ),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, this.quiet = false});
  final String text;
  final bool quiet;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: quiet ? Palette.page : Palette.brandSubtle,
          borderRadius: BorderRadius.circular(Space.radiusSm),
        ),
        child: Text(
          text,
          maxLines: 1,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: quiet ? Palette.muted : Palette.forest,
                fontWeight: FontWeight.w600,
              ),
        ),
      );
}
