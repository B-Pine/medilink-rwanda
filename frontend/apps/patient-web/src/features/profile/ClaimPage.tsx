import type { RecordClaim } from "@medilink/api-client";
import {
  Alert,
  Button,
  buttonClassName,
  Card,
  PhoneField,
  SelectField,
  TextField,
  toE164,
} from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { ProfileLayout } from "./ProfileLayout";
import { errorText, fieldErrors } from "./shared";

type Way = "medilink_number" | "national_id" | "phone";

/** How often the page asks whether reception has confirmed the claim (PA20). */
const RECEPTION_POLL_MS = 10_000;

/**
 * /claim: lookup → emailed code, or the reception reference shown large and polled until reception
 * confirms it → done (FR-PAT-06).
 */
export function ClaimPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [way, setWay] = useState<Way>("medilink_number");
  const [value, setValue] = useState("");
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [claim, setClaim] = useState<RecordClaim | null>(null);
  const [code, setCode] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const lookup = () =>
    way === "medilink_number"
      ? { medilink_number: value }
      : way === "national_id"
        ? { identifier: { kind: "national_id" as const, value } }
        : { phone_e164: toE164(value) || value, full_name: name };
  const start = useMutation({
    mutationFn: () => api.profile.requestClaim({ lookup: lookup(), date_of_birth: dob }),
    onSuccess: setClaim,
  });
  const verify = useMutation({
    mutationFn: () => api.profile.verifyClaim(claim!.id, code),
    onSuccess: (data) => setDone(data.profile.patient_id),
  });
  const atReception = claim?.method === "reception_check";
  const polled = useQuery({
    queryKey: ["profile", "claim", claim?.id],
    queryFn: () => api.profile.claim(claim!.id),
    enabled: atReception,
    refetchInterval: (query) =>
      (query.state.data?.status ?? "awaiting_reception") === "awaiting_reception"
        ? RECEPTION_POLL_MS
        : false,
  });
  const receptionStatus =
    claim?.method === "reception_check" ? (polled.data?.status ?? claim.status) : null;
  const confirmed = receptionStatus === "completed";
  useEffect(() => {
    // the account's own profile moved to the claimed record: reload the profile list
    if (confirmed) void queryClient.invalidateQueries({ queryKey: ["profile", "list"] });
  }, [confirmed, queryClient]);
  const restart = () => {
    setClaim(null);
    setCode("");
    start.reset();
    verify.reset();
  };

  return (
    <ProfileLayout title={t("profile.claim.title")}>
      {done || confirmed ? (
        <Alert tone="success" role="status" title={t("profile.claim.done")}>
          <Link
            to={done ? paths.profileOf(done) : paths.profile}
            className={buttonClassName({ size: "lg" })}
          >
            {t("profile.claim.open")}
          </Link>
        </Alert>
      ) : atReception && receptionStatus !== "awaiting_reception" ? (
        <Alert tone="warning" role="status" title={t("profile.claim.ended")}>
          <Button variant="secondary" onClick={restart}>
            {t("profile.claim.again")}
          </Button>
        </Alert>
      ) : claim?.method === "reception_check" ? (
        <Card padding="md" className="flex flex-col gap-3">
          <p className="m-0">{t("profile.claim.receptionHint")}</p>
          <p
            className="m-0 select-all font-mono text-h1 tracking-widest"
            aria-label={t("profile.claim.reference")}
          >
            {claim.reference}
          </p>
          <Button
            variant="secondary"
            onClick={() => void navigator.clipboard?.writeText(claim.reference ?? "")}
          >
            {t("profile.family.copy")}
          </Button>
          <p className="m-0 text-fg-muted" role="status">
            {t("profile.claim.waiting")}
          </p>
        </Card>
      ) : claim ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            verify.mutate();
          }}
        >
          <p className="m-0">{t("profile.claim.codeSent", { hint: claim.contact_hint })}</p>
          <TextField
            label={t("profile.claim.code")}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={fieldErrors(verify.error).code}
          />
          {verify.isError && !fieldErrors(verify.error).code && (
            <Alert tone="danger" role="alert">
              {errorText(verify.error, t("profile.error"))}
              <Button variant="secondary" onClick={restart}>
                {t("profile.claim.again")}
              </Button>
            </Alert>
          )}
          <Button type="submit" size="lg" disabled={code.length < 6 || verify.isPending}>
            {t("profile.claim.confirm")}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start.mutate();
          }}
        >
          <p className="m-0 text-fg-secondary">{t("profile.claim.intro")}</p>
          <SelectField
            label={t("profile.claim.way")}
            value={way}
            onChange={(e) => setWay(e.target.value as Way)}
          >
            <option value="medilink_number">{t("profile.claim.ways.medilink_number")}</option>
            <option value="national_id">{t("profile.claim.ways.national_id")}</option>
            <option value="phone">{t("profile.claim.ways.phone")}</option>
          </SelectField>
          {way === "phone" ? (
            <>
              <PhoneField
                label={t("profile.fields.phone")}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <TextField
                label={t("profile.fields.fullName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </>
          ) : (
            <TextField
              label={t(`profile.claim.ways.${way}`)}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
            />
          )}
          <TextField
            type="date"
            label={t("profile.fields.dateOfBirth")}
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
          {start.isError && (
            <Alert tone="danger" role="alert">
              {errorText(start.error, t("profile.error"))}
            </Alert>
          )}
          <Button type="submit" size="lg" disabled={!value || !dob || start.isPending}>
            {t("profile.claim.start")}
          </Button>
        </form>
      )}
    </ProfileLayout>
  );
}
