import {
  EMPLOYMENT_TYPES,
  type ClinicianLicenceState,
  type EmploymentType,
  type StaffMembership,
} from "@medilink/api-client";
import { Alert, Badge, Button, Dialog, SelectField, TextareaField } from "@medilink/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { useStepUp } from "../lock";
import { errorText, formatDate, setupKeys, useLocale, useLocalName } from "./shared";

const LICENCE_TONE: Record<ClinicianLicenceState, "success" | "warning" | "danger" | "neutral"> = {
  valid: "success",
  expiring: "warning",
  expired: "danger",
  missing: "neutral",
};

/**
 * The facility admin's licence check (2026-11-03): the clinician's professional details, the scan
 * of their practising licence and its end date; attest only after checking them against the
 * council's register, or refuse with a reason the clinician reads.
 */
export function MemberLicence({
  member,
  onDone,
}: {
  member: StaffMembership;
  onDone: (m: StaffMembership, message: string) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const [refusing, setRefusing] = useState(false);
  const clinician = member.clinician;
  const attest = useMutation({
    mutationFn: () => api.setup.membershipAction(member.id, "attest-licence"),
    onSuccess: (m) => onDone(m, t("setup.staff.done.attest-licence")),
  });
  const open = useMutation({
    mutationFn: (id: string) => api.uploads.staff.downloadLink(id),
    onSuccess: (link) => window.open(link.url, "_blank", "noopener"),
  });
  if (!clinician) return null;
  const ready = clinician.licence_state === "valid" || clinician.licence_state === "expiring";
  const rows: [string, string][] = [
    [
      t("setup.clinician.profession"),
      clinician.profession ? t(`setup.professions.${clinician.profession}`) : "—",
    ],
    [
      t("setup.clinician.specialty"),
      clinician.specialty_code
        ? t(`setup.specialties.${clinician.specialty_code}`)
        : clinician.specialty || "—",
    ],
    [
      t("setup.clinician.council"),
      t(`setup.councils.${clinician.council}`, { defaultValue: clinician.council }),
    ],
    [t("setup.clinician.licence"), clinician.licence_number],
    [
      t("setup.clinician.validUntil"),
      clinician.licence_valid_until ? formatDate(clinician.licence_valid_until, locale) : "—",
    ],
    [
      t("setup.clinician.qualifications"),
      clinician.qualifications.length
        ? clinician.qualifications
            .map((q) => `${q.degree}, ${q.institution} (${q.year})`)
            .join("; ")
        : "—",
    ],
  ];
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 font-heading text-h3">{t("setup.staff.licence")}</h3>
        <Badge tone={LICENCE_TONE[clinician.licence_state]}>
          {t(`setup.licenceState.${clinician.licence_state}`)}
        </Badge>
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="m-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {clinician.licence_file ? (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => open.mutate(clinician.licence_file!.id)}
          disabled={open.isPending}
        >
          {t("setup.staff.openScan")}
        </Button>
      ) : (
        <p className="m-0 text-body-sm text-fg-muted">{t("setup.staff.noScan")}</p>
      )}
      {open.isError && (
        <Alert tone="danger" role="alert">
          {errorText(open.error, t("setup.failed"))}
        </Alert>
      )}
      {clinician.refused_reason && !clinician.attested_at && (
        <Alert tone="warning">
          {t("setup.staff.refusedBecause", { reason: clinician.refused_reason })}
        </Alert>
      )}
      {clinician.attested_at ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">
            {t("setup.staff.attestedOn", { date: formatDate(clinician.attested_at, locale) })}
          </Badge>
          <Button variant="ghost" onClick={() => setRefusing(true)}>
            {t("setup.staff.withdraw")}
          </Button>
        </div>
      ) : (
        <>
          <p className="m-0 text-body-sm text-fg-secondary">{t("setup.staff.checkFirst")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => attest.mutate()}
              disabled={!ready || attest.isPending}
            >
              {t("setup.staff.attest")}
            </Button>
            <Button variant="ghost" onClick={() => setRefusing(true)}>
              {t("setup.staff.refuse")}
            </Button>
          </div>
          {!ready && (
            <p className="m-0 text-body-sm text-fg-muted">
              {t(`setup.staff.cannotAttest.${clinician.licence_state}`)}
            </p>
          )}
        </>
      )}
      {attest.isError && (
        <Alert tone="danger" role="alert">
          {errorText(attest.error, t("setup.failed"))}
        </Alert>
      )}
      {refusing && (
        <RefuseDialog
          member={member}
          onClose={() => setRefusing(false)}
          onDone={(m) => {
            setRefusing(false);
            onDone(m, t("setup.staff.done.refuse-licence"));
          }}
        />
      )}
    </section>
  );
}

function RefuseDialog({
  member,
  onClose,
  onDone,
}: {
  member: StaffMembership;
  onClose: () => void;
  onDone: (m: StaffMembership) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const [reason, setReason] = useState("");
  const refuse = useMutation({
    mutationFn: () => api.setup.membershipAction(member.id, "refuse-licence", reason.trim()),
    onSuccess: onDone,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("setup.staff.refuseTitle", { name: member.full_name })}
      description={t("setup.staff.refuseHint")}
      closeLabel={t("setup.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("setup.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => refuse.mutate()}
            disabled={!reason.trim() || refuse.isPending}
          >
            {t("setup.staff.refuse")}
          </Button>
        </>
      }
    >
      <TextareaField
        label={t("setup.staff.reason")}
        value={reason}
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
      />
      {refuse.isError && (
        <Alert tone="danger" role="alert" className="mt-3">
          {errorText(refuse.error, t("setup.failed"))}
        </Alert>
      )}
    </Dialog>
  );
}

/** Where and how the person works here: a department and the employment type. */
export function MemberWork({
  member,
  onDone,
}: {
  member: StaffMembership;
  onDone: (m: StaffMembership, message: string) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const localName = useLocalName();
  const { withStepUp } = useStepUp();
  const departments = useQuery({
    queryKey: setupKeys.departments,
    queryFn: () => api.setup.departments(),
  });
  const [department, setDepartment] = useState(member.department_id ?? "");
  const [employment, setEmployment] = useState<EmploymentType | "">(member.employment_type);
  const changed =
    department !== (member.department_id ?? "") || employment !== member.employment_type;
  const save = useMutation({
    mutationFn: () =>
      withStepUp(() =>
        api.setup.updateMembership(member.id, {
          version: member.version,
          department_id: department || null,
          employment_type: employment,
        }),
      ),
    onSuccess: (m) => onDone(m, t("setup.saved")),
  });
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border/60 p-4">
      <h3 className="m-0 font-heading text-h3">{t("setup.staff.work")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label={t("setup.staff.department")}
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">{t("setup.staff.noDepartment")}</option>
          {(departments.data?.results ?? [])
            .filter((d) => d.is_active !== false)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {localName(d.name_i18n)}
              </option>
            ))}
        </SelectField>
        <SelectField
          label={t("setup.staff.employment")}
          value={employment}
          onChange={(e) => setEmployment(e.target.value as EmploymentType | "")}
        >
          <option value="">{t("setup.staff.notSet")}</option>
          {EMPLOYMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`setup.employment.${type}`)}
            </option>
          ))}
        </SelectField>
      </div>
      {save.isError && (
        <Alert tone="danger" role="alert">
          {errorText(save.error, t("setup.failed"))}
        </Alert>
      )}
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => save.mutate()}
        disabled={!changed || save.isPending || !member.is_active}
      >
        {t("setup.staff.saveWork")}
      </Button>
    </section>
  );
}
