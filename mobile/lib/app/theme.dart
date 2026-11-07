import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../ui/icons.dart';

/// MediLink colours (docs/upgrade/15-mobile-app.md §1): the website palette, nothing new.
abstract final class Palette {
  static const forest = Color(0xFF123D2B);
  static const forestRaised = Color(0xFF1A4D37);
  static const brand = Color(0xFF17694D);
  static const brandPressed = Color(0xFF0F4F3A);
  static const brandSubtle = Color(0xFFE7F3ED);
  static const onForestMuted = Color(0xFFB9D6C4);
  static const onForestAccent = Color(0xFF6EE7B7);
  static const ochre = Color(0xFFFBBF24);
  static const ochreText = Color(0xFF8A5A00);
  static const ochreSubtle = Color(0xFFFEF3C7);
  static const page = Color(0xFFF6F8F7);
  static const surface = Color(0xFFFFFFFF);
  static const ink = Color(0xFF14231C);
  static const muted = Color(0xFF5B6B63);
  static const hairline = Color(0xFFE3E9E6);
  static const skeleton = Color(0xFFE9EEEB);
  static const danger = Color(0xFFB42318);
  static const dangerSubtle = Color(0xFFFDECEA);
}

abstract final class Fonts {
  /// Headings and big numbers only.
  static const heading = 'Figtree';

  /// Everything else.
  static const body = 'Inter';

  /// Times, queue numbers, waits, distances and counts line up digit for digit.
  static const tabular = [FontFeature.tabularFigures()];
}

/// The type scale: six sizes, nothing in between, plus [hero] for the full-screen ticket number.
/// Screens use the text theme, never a size.
abstract final class TypeScale {
  static const hero = 64.0; // the ticket number on the ticket screen (displayLarge)
  static const display = 40.0; // big numbers: ticket card, times
  static const title = 24.0; // page and band titles
  static const headline = 18.0; // section and card headings
  static const body = 15.0; // text, list titles, buttons
  static const label = 13.0; // chips, pills, section labels
  static const caption = 12.0; // secondary lines
}

extension Tabular on TextStyle {
  /// The same style with tabular figures.
  TextStyle get tabular => copyWith(fontFeatures: Fonts.tabular);
}

/// Spacing scale (4-pt grid) and radii. Small radii, as on the website.
abstract final class Space {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
  static const xxl = 32.0;
  static const radiusSm = 8.0; // pills inside cards, small tiles
  static const radius = 12.0; // buttons, inputs, chips
  static const radiusLg = 16.0; // cards and groups
  static const radiusXl = 20.0; // sheets
  static const pill = 999.0;

  /// Minimum height of a tappable row.
  static const row = 56.0;

  /// Minimum height of the main action button.
  static const action = 52.0;

  /// The depth of the forest band's curved foot (main tabs and detail headers).
  static const curve = 28.0;
}

/// Three depth levels and nothing else.
enum Depth {
  /// The page: no border, no shadow.
  flat,

  /// A white surface with a hairline border.
  card,

  /// Only for what floats over content: sheets, the map card, the card over the band.
  floating,
}

abstract final class Shadows {
  /// Card: near invisible, it only keeps white from melting into the page.
  static final card = [BoxShadow(color: Palette.forest.withValues(alpha: 0.03), blurRadius: 6, offset: const Offset(0, 1))];

  /// Floating: one soft shadow.
  static final floating = [BoxShadow(color: Palette.forest.withValues(alpha: 0.07), blurRadius: 24, offset: const Offset(0, 6))];

  static List<BoxShadow> of(Depth depth) => switch (depth) {
        Depth.flat => const [],
        Depth.card => card,
        Depth.floating => floating,
      };
}

/// Motion: short, eased, and off when the system asks for no animations.
abstract final class Motion {
  static const fast = Duration(milliseconds: 120);
  static const normal = Duration(milliseconds: 220);
  static const slow = Duration(milliseconds: 350);
  static const ease = Curves.easeOutCubic;

  static bool off(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;

  /// [d], or zero when animations are off.
  static Duration of(BuildContext context, Duration d) => off(context) ? Duration.zero : d;

  /// The one page transition (shared axis): the new page slides in a little from the right
  /// while it fades in; the page underneath drifts left. Nothing moves when animations are off.
  static Widget sharedAxis(BuildContext context, Animation<double> animation, Animation<double> secondary, Widget child) {
    if (off(context)) return child;
    final enter = CurvedAnimation(parent: animation, curve: ease, reverseCurve: Curves.easeInCubic);
    final fade = CurvedAnimation(parent: animation, curve: const Interval(0, 0.6, curve: Curves.easeOut));
    final leave = CurvedAnimation(parent: secondary, curve: ease, reverseCurve: Curves.easeInCubic);
    return SlideTransition(
      position: Tween(begin: Offset.zero, end: const Offset(-0.06, 0)).animate(leave),
      child: FadeTransition(
        opacity: fade,
        child: SlideTransition(
          position: Tween(begin: const Offset(0.08, 0), end: Offset.zero).animate(enter),
          child: child,
        ),
      ),
    );
  }
}

/// [Motion.sharedAxis] for routes built by the theme (MaterialPageRoute).
class SharedAxisPageTransitionsBuilder extends PageTransitionsBuilder {
  const SharedAxisPageTransitionsBuilder();

  @override
  Duration get transitionDuration => Motion.slow;

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) =>
      Motion.sharedAxis(context, animation, secondaryAnimation, child);
}

/// Cards and tiles: shrink to 0.98 while pressed (120 ms, ease out) instead of an ink ripple.
/// Keeps keyboard focus and semantics from [InkWell].
class Pressable extends StatefulWidget {
  const Pressable({super.key, required this.child, required this.onTap, this.onLongPress, this.borderRadius});

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final BorderRadius? borderRadius;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _down = false;

  @override
  Widget build(BuildContext context) => AnimatedScale(
        scale: _down ? 0.98 : 1,
        duration: Motion.of(context, Motion.fast),
        curve: Curves.easeOut,
        child: InkWell(
          onTap: widget.onTap,
          onLongPress: widget.onLongPress,
          borderRadius: widget.borderRadius,
          splashFactory: NoSplash.splashFactory,
          highlightColor: Colors.transparent,
          onHighlightChanged: (down) => setState(() => _down = down),
          child: widget.child,
        ),
      );
}

/// A white surface at [Depth.card] (hairline, no shadow) or, with [raised], [Depth.floating].
/// Tappable cards shrink a little while pressed ([Pressable]).
class SoftCard extends StatelessWidget {
  const SoftCard({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.raised = false,
    this.radius = Space.radiusLg,
    this.color,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final bool raised;
  final double radius;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final fill = color ?? Palette.surface;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radius),
      side: raised || fill != Palette.surface ? BorderSide.none : const BorderSide(color: Palette.hairline),
    );
    final card = DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: Shadows.of(raised ? Depth.floating : Depth.card),
      ),
      child: Material(color: fill, shape: shape, clipBehavior: Clip.antiAlias, child: child),
    );
    if (onTap == null && onLongPress == null) return card;
    return Pressable(onTap: onTap, onLongPress: onLongPress, borderRadius: BorderRadius.circular(radius), child: card);
  }
}

ThemeData buildTheme() {
  const scheme = ColorScheme.light(
    primary: Palette.brand,
    onPrimary: Colors.white,
    primaryContainer: Palette.brandSubtle,
    onPrimaryContainer: Palette.forest,
    secondary: Palette.forest,
    onSecondary: Colors.white,
    tertiary: Palette.ochre,
    error: Palette.danger,
    onError: Colors.white,
    surface: Palette.surface,
    onSurface: Palette.ink,
    onSurfaceVariant: Palette.muted,
    outline: Palette.hairline,
    outlineVariant: Palette.hairline,
    surfaceContainerHighest: Palette.skeleton,
  );

  TextStyle h(double size, FontWeight weight, {double height = 1.2}) => TextStyle(
        fontFamily: Fonts.heading,
        fontSize: size,
        fontWeight: weight,
        height: height,
        color: Palette.ink,
        letterSpacing: -0.2,
      );
  TextStyle b(double size, FontWeight weight, {Color color = Palette.ink, double height = 1.4}) => TextStyle(
        fontFamily: Fonts.body,
        fontSize: size,
        fontWeight: weight,
        height: height,
        color: color,
      );

  // Every text style is one of the six sizes of [TypeScale].
  final display = h(TypeScale.display, FontWeight.w800, height: 1.05).copyWith(fontFeatures: Fonts.tabular);
  final title = h(TypeScale.title, FontWeight.w700);
  final headline = h(TypeScale.headline, FontWeight.w700);
  final text = TextTheme(
    displayLarge: display.copyWith(fontSize: TypeScale.hero, height: 1.0),
    displayMedium: display,
    displaySmall: display,
    headlineLarge: title,
    headlineMedium: title,
    headlineSmall: title,
    titleLarge: headline,
    titleMedium: b(TypeScale.body, FontWeight.w600),
    titleSmall: b(TypeScale.body, FontWeight.w600),
    bodyLarge: b(TypeScale.body, FontWeight.w400),
    bodyMedium: b(TypeScale.body, FontWeight.w400),
    bodySmall: b(TypeScale.caption, FontWeight.w400, color: Palette.muted),
    labelLarge: b(TypeScale.body, FontWeight.w600),
    labelMedium: b(TypeScale.label, FontWeight.w500, color: Palette.muted),
    labelSmall: b(TypeScale.caption, FontWeight.w600, color: Palette.muted, height: 1.3),
  );

  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(Space.radius));
  OutlineInputBorder border(Color color, [double width = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(Space.radius),
        borderSide: BorderSide(color: color, width: width),
      );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Palette.page,
    fontFamily: Fonts.body,
    textTheme: text,
    // No ink ripples: rows tint softly while pressed, cards shrink (Pressable), buttons darken.
    splashFactory: NoSplash.splashFactory,
    highlightColor: Palette.forest.withValues(alpha: 0.05),
    materialTapTargetSize: MaterialTapTargetSize.padded,
    // The website's arrow, also where the Material icon font is not loaded (screen renders).
    actionIconTheme: ActionIconThemeData(
      backButtonIconBuilder: (_) => const Icon(PhosphorIconsRegular.arrowLeft),
      closeButtonIconBuilder: (_) => const Icon(PhosphorIconsRegular.x),
    ),
    // Sub-pages: a light bar on the page colour, white once content scrolls under it.
    appBarTheme: AppBarTheme(
      backgroundColor: WidgetStateColor.resolveWith(
        (s) => s.contains(WidgetState.scrolledUnder) ? Palette.surface : Palette.page,
      ),
      foregroundColor: Palette.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      systemOverlayStyle: SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent),
      // No titleTextStyle: the bar title is titleLarge (18) and a large title headlineMedium (24).
    ),
    cardTheme: CardThemeData(
      color: Palette.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Space.radiusLg),
        side: const BorderSide(color: Palette.hairline),
      ),
    ),
    // Enabled: white on brand, darker while pressed. Disabled: clearly grey.
    filledButtonTheme: FilledButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size.fromHeight(Space.action)),
        shape: WidgetStatePropertyAll(shape),
        elevation: const WidgetStatePropertyAll(0),
        textStyle: WidgetStatePropertyAll(b(TypeScale.body, FontWeight.w600)),
        backgroundColor: WidgetStateColor.resolveWith((s) {
          if (s.contains(WidgetState.disabled)) return Palette.skeleton;
          if (s.contains(WidgetState.pressed)) return Palette.brandPressed;
          return Palette.brand;
        }),
        foregroundColor: WidgetStateColor.resolveWith(
          (s) => s.contains(WidgetState.disabled) ? Palette.muted : Colors.white,
        ),
        iconColor: WidgetStateColor.resolveWith(
          (s) => s.contains(WidgetState.disabled) ? Palette.muted : Colors.white,
        ),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(Space.action),
        shape: shape,
        side: const BorderSide(color: Palette.hairline),
        backgroundColor: Palette.surface,
        foregroundColor: Palette.ink,
        textStyle: b(TypeScale.body, FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: Palette.brand,
        minimumSize: const Size(48, 48),
        textStyle: b(TypeScale.body, FontWeight.w600),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(minimumSize: const Size(48, 48))),
    // Inputs: label and value on the left, white field, hairline border.
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Palette.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.lg),
      border: border(Palette.hairline),
      enabledBorder: border(Palette.hairline),
      disabledBorder: border(Palette.hairline),
      focusedBorder: border(Palette.brand, 1.6),
      errorBorder: border(Palette.danger),
      focusedErrorBorder: border(Palette.danger, 1.6),
      labelStyle: b(TypeScale.body, FontWeight.w400, color: Palette.muted),
      floatingLabelStyle: b(TypeScale.label, FontWeight.w500, color: Palette.muted),
      hintStyle: b(TypeScale.body, FontWeight.w400, color: Palette.muted),
      suffixIconColor: Palette.muted,
      prefixIconColor: Palette.muted,
    ),
    // Brand switch: a clear green "on", a clear grey "off" with a visible outline.
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateColor.resolveWith((s) {
        if (s.contains(WidgetState.selected)) return Colors.white;
        return s.contains(WidgetState.disabled) ? Palette.hairline : Palette.muted;
      }),
      trackColor: WidgetStateColor.resolveWith((s) {
        final on = s.contains(WidgetState.selected);
        if (s.contains(WidgetState.disabled)) return on ? Palette.brand.withValues(alpha: 0.35) : Palette.page;
        return on ? Palette.brand : Palette.skeleton;
      }),
      trackOutlineColor: WidgetStateColor.resolveWith((s) {
        if (s.contains(WidgetState.selected)) return Colors.transparent;
        return s.contains(WidgetState.disabled) ? Palette.hairline : Palette.muted.withValues(alpha: 0.6);
      }),
      trackOutlineWidth: const WidgetStatePropertyAll(1.5),
      overlayColor: WidgetStatePropertyAll(Palette.brand.withValues(alpha: 0.08)),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateColor.resolveWith((s) => s.contains(WidgetState.selected) ? Palette.brand : Colors.transparent),
      side: const BorderSide(color: Palette.muted, width: 1.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Palette.surface,
      selectedColor: Palette.brand,
      side: const BorderSide(color: Palette.hairline),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Space.pill)),
      labelStyle: b(TypeScale.label, FontWeight.w600),
      padding: const EdgeInsets.symmetric(horizontal: Space.sm, vertical: Space.xs),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: Palette.brand,
      minTileHeight: Space.row,
      titleTextStyle: text.titleSmall,
      subtitleTextStyle: text.bodySmall,
      contentPadding: const EdgeInsets.symmetric(horizontal: Space.lg),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Palette.surface,
      indicatorColor: Palette.brandSubtle,
      elevation: 0,
      height: 68,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => b(TypeScale.caption, FontWeight.w600,
            color: s.contains(WidgetState.selected) ? Palette.brand : Palette.muted),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: Palette.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: Palette.hairline,
      elevation: 0,
      shadowColor: Palette.forest.withValues(alpha: 0.07),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Space.radiusXl))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Palette.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Space.radiusXl)),
      titleTextStyle: headline,
      contentTextStyle: text.bodyMedium,
    ),
    dividerTheme: const DividerThemeData(color: Palette.hairline, space: 1, thickness: 1),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: Palette.brand, linearTrackColor: Palette.brandSubtle),
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: SharedAxisPageTransitionsBuilder(),
        TargetPlatform.iOS: SharedAxisPageTransitionsBuilder(),
      },
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Palette.forest,
      contentTextStyle: b(TypeScale.body, FontWeight.w500, color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Space.radiusSm)),
    ),
  );
}
