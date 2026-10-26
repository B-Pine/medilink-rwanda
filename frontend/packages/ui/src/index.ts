export { Alert } from "./components/Alert";
export type { AlertProps, AlertTone } from "./components/Alert";
export { Badge } from "./components/Badge";
export type { BadgeProps, BadgeTone } from "./components/Badge";
export { Button, buttonClassName } from "./components/Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./components/Button";
export { Card } from "./components/Card";
export { CheckboxField } from "./components/CheckboxField";
export type { CheckboxFieldProps } from "./components/CheckboxField";
export { ErrorSummary } from "./components/ErrorSummary";
export type { ErrorSummaryItem, ErrorSummaryProps } from "./components/ErrorSummary";
export { Field, inputClassName } from "./components/Field";
export type { FieldControlProps, FieldProps } from "./components/Field";
export { ImigongoPattern } from "./components/ImigongoPattern";
export { LanguageSwitcher } from "./components/LanguageSwitcher";
export { Logo } from "./components/Logo";
export type { LogoProps } from "./components/Logo";
export {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "./components/Menu";
export { PasswordField } from "./components/PasswordField";
export type { PasswordFieldProps } from "./components/PasswordField";
export { SelectField } from "./components/SelectField";
export type { SelectFieldProps } from "./components/SelectField";
export { Skeleton } from "./components/Skeleton";
export { MAIN_CONTENT_ID, SkipLink } from "./components/SkipLink";
export { LoadingState, Spinner } from "./components/Spinner";
export { TextField } from "./components/TextField";
export type { TextFieldProps } from "./components/TextField";
export { ThemeToggle } from "./components/ThemeToggle";
export { VisuallyHidden } from "./components/VisuallyHidden";
export { errorSummaryItems, fieldErrorMessage, SERVER_ERROR_TYPE } from "./forms/errors";
export type { FormFieldError } from "./forms/errors";
export {
  applyTheme,
  initTheme,
  storedTheme,
  THEME_PREFERENCES,
  ThemeProvider,
  useTheme,
} from "./theme/theme";
export type { ThemePreference } from "./theme/theme";
export { cx } from "./utils/cx";

// ---- New components (own files): exports ONLY between the sprint's markers ----
// [S1]
export { DataTable, PAGE_SIZES } from "./components/DataTable";
export type {
  ColumnDef,
  DataTableLabels,
  DataTableProps,
  Density,
  FilterChip,
  SortingState,
} from "./components/DataTable";
export { CommandPalette } from "./components/CommandPalette";
export type {
  CommandGroup,
  CommandPaletteLabels,
  CommandPaletteProps,
  CommandRow,
} from "./components/CommandPalette";
export { ConfirmDialog, Dialog } from "./components/Dialog";
export type { ConfirmDialogProps, DialogProps } from "./components/Dialog";
export { DocumentViewer } from "./components/DocumentViewer";
export { EmptyState } from "./components/EmptyState";
export type { EmptyStateProps } from "./components/EmptyState";
export type { DocumentViewerLabels, DocumentViewerProps } from "./components/DocumentViewer";
export { FileUpload } from "./components/FileUpload";
export type {
  FileUploadItem,
  FileUploadLabels,
  FileUploadProps,
  FileUploadStatus,
} from "./components/FileUpload";
export { SidePanel } from "./components/SidePanel";
export type { SidePanelProps } from "./components/SidePanel";
export { Stepper } from "./components/Stepper";
export type { StepperProps, StepperStep, StepState } from "./components/Stepper";
export { SwitchField } from "./components/Switch";
export type { SwitchFieldProps } from "./components/Switch";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/Tabs";
export { TextareaField } from "./components/TextareaField";
export type { TextareaFieldProps } from "./components/TextareaField";
export { formatKigaliTime, Timeline } from "./components/Timeline";
export type { TimelineEvent, TimelineProps } from "./components/Timeline";
// [/S1]
// [S3]
export { CameraCapture } from "./components/CameraCapture";
export type { CameraCaptureLabels, CameraCaptureProps } from "./components/CameraCapture";
export { MaskedValue } from "./components/MaskedValue";
export type { MaskedValueLabels, MaskedValueProps } from "./components/MaskedValue";
export { detectSearchType, PersonSearch } from "./components/PersonSearch";
export type {
  PersonSearchItem,
  PersonSearchLabels,
  PersonSearchProps,
  SearchType,
} from "./components/PersonSearch";
export { formatPhone, PhoneField, toE164 } from "./components/PhoneField";
export type { PhoneFieldProps } from "./components/PhoneField";
export { ProfileSwitcher } from "./components/ProfileSwitcher";
export type { ProfileSwitcherProps, SwitcherProfile } from "./components/ProfileSwitcher";
// [/S3]
// [S9]
// [/S9]
// [S2]
export { formatRwf, MoneyField, TimeRangeField, timeBefore } from "./components/SetupFields";
export type { MoneyFieldProps, TimeRangeFieldProps } from "./components/SetupFields";
export { WeekGrid } from "./components/WeekGrid";
export type { WeekGridBlock, WeekGridLabels, WeekGridProps } from "./components/WeekGrid";
// [/S2]
// [S10]
// [/S10]
export { readPreference, writePreference } from "./preferences/storage";
export type { PreferenceKey } from "./preferences/storage";
// [S4]
export { ProgressDots, QueueFlagChip, QueueStateBadge, TicketNumber } from "./components/Queue";
export type { QueueFlag, QueueState } from "./components/Queue";
// [/S4]
