import {
  isApiError,
  newIdempotencyKey,
  type Hold,
  type PublicSlot,
  type StaffBooking,
  type Uuid,
} from "@medilink/api-client";
import {
  Alert,
  BODY_SYSTEM_ORDER,
  Button,
  PhoneField,
  SelectField,
  SidePanel,
  SymptomPicker,
  TextareaField,
  toE164,
} from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PatientPicker, type PickedPatient } from "../patients";
import { useLocalName } from "../setup/shared";
import { SlotStep } from "./SlotStep";
import { countdown, kigaliDate, slotDay, slotTime } from "./time";

/** Query keys refreshed after a booking change (the board's Expected list lives under it). */
export const bookingChangeKeys = [["queue", "expected"], ["bookings"]] as const;

const MAX_SYMPTOMS = 5;

type Step = "patient" | "slot" | "reason" | "review" | "done";

export type PhoneBookingMode = { kind: "new" } | { kind: "reschedule"; booking: StaffBooking };

/** Seconds left on a hold, updated every second (design 07 §3.2: the hold is visible). */
function useSecondsLeft(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
}

/**
 * Phone booking at reception (contract S5 R2–R4, §6.2 `/bookings/new`): find or register the
 * patient, service and doctor, a held time, the reason, a contact phone, confirm. In
 * `reschedule` mode the patient and service are fixed and only the time changes.
 */
export function PhoneBookingPanel({
  mode,
  onClose,
}: {
  mode: PhoneBookingMode;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const language = i18n.resolvedLanguage ?? "en";
  const localName = useLocalName();
  const moving = mode.kind === "reschedule" ? mode.booking : null;

  const steps: Step[] = moving ? ["slot", "review"] : ["patient", "slot", "reason", "review"];
  const [step, setStep] = useState<Step>(steps[0]!);
  const [patient, setPatient] = useState<PickedPatient | null>(
    moving && moving.facility_patient_id
      ? { id: moving.facility_patient_id, name: moving.display_name }
      : null,
  );
  const [serviceId, setServiceId] = useState<string>(moving?.service_id ?? "");
  const [held, setHeld] = useState<{ slot: PublicSlot; hold: Hold } | null>(null);
  const [symptoms, setSymptoms] = useState<Set<string>>(new Set());
  const [reasonText, setReasonText] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [expiredNote, setExpiredNote] = useState(false);
  const key = useRef(newIdempotencyKey());
  const secondsLeft = useSecondsLeft(held?.hold.expires_at ?? null);

  const services = useQuery({
    queryKey: ["setup", "services"],
    queryFn: () => api.setup.services(),
    enabled: !moving,
  });
  const bookable = (services.data?.results ?? []).filter((s) => s.is_active && s.is_bookable);
  const chosenService = serviceId || bookable[0]?.id || "";
  const serviceLabel = (id: Uuid) => {
    const found = (services.data?.results ?? []).find((s) => s.id === id);
    return found ? localName(found.name_i18n) : "";
  };

  const catalogue = useQuery({
    queryKey: ["bookings", "symptoms"],
    queryFn: () => api.booking.symptoms(),
    enabled: !moving,
    staleTime: 60 * 60_000,
  });
  const symptomList = catalogue.data ?? [];
  const chosenSymptoms = symptomList.filter((s) => symptoms.has(s.code));
  const redFlag = chosenSymptoms.some((s) => s.is_red_flag);

  const refresh = () => {
    for (const queryKey of bookingChangeKeys) void queryClient.invalidateQueries({ queryKey });
  };

  const save = useMutation({
    mutationFn: () => {
      if (moving)
        return api.booking.staff.reschedule(moving.id, moving.version, held!.hold.hold_id);
      return api.booking.staff.book(
        {
          hold_id: held!.hold.hold_id,
          facility_patient_id: patient!.id,
          symptoms: [...symptoms].map((code) => ({ code })),
          ...(reasonText.trim() ? { reason_text: reasonText.trim() } : {}),
          ...(toE164(phone) ? { contact_phone: toE164(phone)! } : {}),
        },
        key.current,
      );
    },
    onSuccess: () => {
      setStep("done");
      refresh();
    },
    onError: (error) => {
      if (isApiError(error) && error.code === "hold_expired") {
        setHeld(null);
        setExpiredNote(true);
        setStep("slot");
      } else if (isApiError(error) && error.status === 409) refresh(); // stale booking version
    },
  });

  // A released hold sends the user back to choose a time (never book on a stale hold).
  const expired = held !== null && secondsLeft === 0 && step !== "done" && !save.isPending;
  const view: Step = expired ? "slot" : step;

  const index = steps.indexOf(view);
  const title = moving
    ? t("bookings.phone.rescheduleTitle", { name: moving.display_name })
    : t("bookings.phone.title");

  const back = () => {
    const previous = steps[index - 1];
    if (previous) setStep(previous);
  };

  const continueFromReason = () => {
    if (phone.trim() && !toE164(phone)) {
      setPhoneError(t("bookings.reason.phoneInvalid"));
      return;
    }
    setPhoneError(undefined);
    setStep("review");
  };

  const footer = (() => {
    if (view === "done")
      return (
        <>
          {!moving && (
            <Button
              variant="secondary"
              onClick={() => {
                key.current = newIdempotencyKey();
                setPatient(null);
                setHeld(null);
                setSymptoms(new Set());
                setReasonText("");
                setPhone("");
                save.reset();
                setStep("patient");
              }}
            >
              {t("bookings.done.another")}
            </Button>
          )}
          <Button onClick={onClose}>{t("bookings.done.finish")}</Button>
        </>
      );
    if (view === "patient") return undefined;
    return (
      <>
        {index > 0 && (
          <Button variant="secondary" onClick={back}>
            {t("bookings.nav.back")}
          </Button>
        )}
        {view === "reason" && (
          <Button disabled={symptoms.size === 0} onClick={continueFromReason}>
            {t("bookings.nav.next")}
          </Button>
        )}
        {view === "review" && (
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {moving ? t("bookings.review.confirmReschedule") : t("bookings.review.confirm")}
          </Button>
        )}
      </>
    );
  })();

  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      closeLabel={t("bookings.phone.close")}
      footer={footer}
    >
      <div className="flex flex-col gap-5">
        {view !== "done" && (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-body-sm font-semibold text-fg-muted">
              {t("bookings.steps.progress", { step: index + 1, total: steps.length })}
            </p>
            <div aria-hidden="true" className="flex gap-1">
              {steps.map((s, i) => (
                <span
                  key={s}
                  className={
                    i <= index
                      ? "h-1 flex-1 rounded-full bg-brand"
                      : "h-1 flex-1 rounded-full bg-subtle"
                  }
                />
              ))}
            </div>
            <h3 className="m-0 font-heading text-h3">{t(`bookings.steps.${view}`)}</h3>
          </div>
        )}

        {patient && view !== "patient" && view !== "done" && (
          <div className="flex items-center justify-between gap-3 rounded-md bg-subtle px-3 py-2">
            <span className="font-semibold">{patient.name}</span>
            {!moving && (
              <Button variant="ghost" onClick={() => setStep("patient")}>
                {t("bookings.nav.change")}
              </Button>
            )}
          </div>
        )}

        {held && secondsLeft !== null && view !== "slot" && view !== "done" && (
          <p className="m-0 text-body-sm text-fg-secondary">
            <span aria-hidden="true" className="tabular-nums">
              {t("bookings.hold.holding", { time: countdown(secondsLeft) })}
            </span>
            <span className="sr-only" role="status">
              {t("bookings.hold.holdingMinutes", {
                count: Math.max(1, Math.ceil(secondsLeft / 60)),
              })}
            </span>
          </p>
        )}

        {view === "patient" && (
          <PatientPicker
            onPicked={(picked) => {
              setPatient(picked);
              setStep("slot");
            }}
          />
        )}

        {view === "slot" && (
          <>
            {(expiredNote || expired) && <Alert tone="warning">{t("bookings.hold.expired")}</Alert>}
            {!moving && services.isSuccess && bookable.length === 0 && (
              <Alert tone="info">{t("bookings.slot.noServices")}</Alert>
            )}
            {!moving && bookable.length > 0 && (
              <SelectField
                label={t("bookings.slot.service")}
                value={chosenService}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  setHeld(null);
                }}
              >
                {bookable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {localName(s.name_i18n)}
                  </option>
                ))}
              </SelectField>
            )}
            {chosenService && (
              <SlotStep
                key={chosenService}
                serviceId={chosenService}
                onHeld={(slot, hold) => {
                  setHeld({ slot, hold });
                  setExpiredNote(false);
                  setStep(moving ? "review" : "reason");
                }}
              />
            )}
          </>
        )}

        {view === "reason" && (
          <>
            <div className="flex flex-col gap-1">
              <p className="m-0 font-semibold">{t("bookings.reason.symptoms")}</p>
              <p className="m-0 text-body-sm text-fg-muted">{t("bookings.reason.symptomsHint")}</p>
            </div>
            <SymptomPicker
              legend={t("bookings.reason.symptoms")}
              redFlagLabel={t("bookings.reason.redFlag")}
              items={symptomList.map((s) => ({
                code: s.code,
                label: localName(s.name_i18n),
                group: s.body_system,
                redFlag: s.is_red_flag,
              }))}
              groups={BODY_SYSTEM_ORDER.map((key) => ({
                key,
                label: t(`bookings.body.${key}`, { defaultValue: key }),
              }))}
              chosen={symptoms}
              onToggle={(code) =>
                setSymptoms((current) => {
                  const next = new Set(current);
                  if (next.has(code)) next.delete(code);
                  else if (next.size < MAX_SYMPTOMS) next.add(code);
                  return next;
                })
              }
            />
            {redFlag && (
              <Alert tone="danger" role="alert">
                {t("bookings.reason.redFlagAlert")}
              </Alert>
            )}
            <TextareaField
              label={t("bookings.reason.text")}
              optional
              rows={3}
              maxLength={500}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
            />
            <PhoneField
              label={t("bookings.reason.phone")}
              hint={t("bookings.reason.phoneHint")}
              optional
              value={phone}
              error={phoneError}
              onChange={(e) => setPhone(e.target.value)}
            />
          </>
        )}

        {view === "review" && held && (
          <>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-fg-muted">{t("bookings.review.patient")}</dt>
              <dd className="m-0 font-semibold">{patient?.name ?? moving?.display_name}</dd>
              {!moving && (
                <>
                  <dt className="text-fg-muted">{t("bookings.review.service")}</dt>
                  <dd className="m-0">{serviceLabel(chosenService)}</dd>
                </>
              )}
              <dt className="text-fg-muted">{t("bookings.review.when")}</dt>
              <dd className="m-0">
                {slotDay(kigaliDate(new Date(held.slot.starts_at)), language, "full")} ·{" "}
                <span className="tabular-nums">{slotTime(held.slot.starts_at, language)}</span>
              </dd>
              {held.slot.doctor && (
                <>
                  <dt className="text-fg-muted">{t("bookings.review.doctor")}</dt>
                  <dd className="m-0">{held.slot.doctor}</dd>
                </>
              )}
              {!moving && (
                <>
                  <dt className="text-fg-muted">{t("bookings.review.symptoms")}</dt>
                  <dd className="m-0">
                    {chosenSymptoms.map((s) => localName(s.name_i18n)).join(", ")}
                  </dd>
                </>
              )}
              {toE164(phone) && (
                <>
                  <dt className="text-fg-muted">{t("bookings.review.phone")}</dt>
                  <dd className="m-0 tabular-nums">{phone}</dd>
                </>
              )}
            </dl>
            {save.isError && (
              <Alert tone="danger" role="alert">
                {isApiError(save.error) && save.error.status === 409
                  ? t("bookings.review.stale")
                  : isApiError(save.error)
                    ? save.error.message
                    : t("bookings.review.failed")}
              </Alert>
            )}
          </>
        )}

        {view === "done" && save.data && (
          <div className="flex flex-col items-center gap-4 py-4 text-center" role="status">
            <h3 className="m-0 font-heading text-h2">
              {moving ? t("bookings.done.moved") : t("bookings.done.title")}
            </h3>
            <p className="m-0 text-fg-secondary">
              {slotDay(kigaliDate(new Date(save.data.starts_at)), language, "full")} ·{" "}
              <span className="tabular-nums">{slotTime(save.data.starts_at, language)}</span>
            </p>
            <div className="flex flex-col items-center gap-1 rounded-lg border-2 border-dashed border-brand px-8 py-4">
              <span className="text-body-sm font-semibold text-fg-muted">
                {t("bookings.done.code")}
              </span>
              <span className="font-mono text-h1 font-bold tracking-[0.2em] tabular-nums">
                {save.data.booking_code}
              </span>
            </div>
            <p className="m-0 max-w-sm text-body-sm text-fg-secondary">{t("bookings.done.tell")}</p>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
