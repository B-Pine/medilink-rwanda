import 'package:flutter/material.dart';

import '../app/theme.dart';
import 'band.dart';
import 'icons.dart';

/// The short forest band behind a tab's title (Care, Visits, Me), with optional content below
/// the title (search, filters, profile). Same curve as every band.
class BandHeader extends StatelessWidget {
  const BandHeader({super.key, required this.title, this.bottom, this.trailing, this.leading, this.height = 120});

  final String title;
  final Widget? bottom;
  final Widget? trailing;
  final Widget? leading;
  final double height;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Stack(
      children: [
        Positioned.fill(child: ForestBand(height: height + top)),
        Padding(
          padding: EdgeInsets.fromLTRB(Space.lg, top + Space.md, Space.lg, Space.curve + Space.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 48),
                child: Row(
                  children: [
                    if (leading != null) leading! else const SizedBox(width: Space.sm),
                    Expanded(
                      child: Text(
                        title,
                        style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: Colors.white),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    ?trailing,
                  ],
                ),
              ),
              if (bottom != null) ...[const SizedBox(height: Space.md), bottom!],
            ],
          ),
        ),
      ],
    );
  }
}

/// A white back arrow for screens under a band.
class BandBack extends StatelessWidget {
  const BandBack({super.key});

  @override
  Widget build(BuildContext context) => IconButton(
        tooltip: MaterialLocalizations.of(context).backButtonTooltip,
        onPressed: () => Navigator.of(context).maybePop(),
        icon: const Icon(PhosphorIconsRegular.arrowLeft, color: Colors.white),
      );
}
