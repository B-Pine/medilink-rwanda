import type { FeatureFlag } from "@medilink/api-client";
import { Alert, Card, LoadingState, SwitchField } from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { useStepUp } from "../lock";
import { actionError, PlatformOnly } from "./shared";

/** /platform/feature-flags: the flag catalogue and defaults (NFR-OPS-07). */
export function FlagsPage() {
  return (
    <PlatformOnly>
      <Flags />
    </PlatformOnly>
  );
}

function Flags() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { withStepUp } = useStepUp();
  const flags = useQuery({
    queryKey: ["platform", "flags"],
    queryFn: () => api.onboarding.platform.flags(),
  });
  const [error, setError] = useState<string | undefined>();
  const toggle = useMutation({
    mutationFn: ({ flag, on }: { flag: FeatureFlag; on: boolean }) =>
      withStepUp(() =>
        api.onboarding.platform.updateFlag(flag.code, {
          version: flag.version,
          default_enabled: on,
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["platform", "flags"] }),
    onError: (failure) => setError(actionError(failure, t("errors.generic"))),
  });
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title={t("platform.flags.title")} description={t("platform.flags.intro")} />
      {flags.isPending && <LoadingState />}
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      {(flags.data ?? []).map((flag) => (
        <Card key={flag.code} padding="md" className="flex flex-col gap-1">
          <SwitchField
            label={t(`platform.flags.names.${flag.code}`, { defaultValue: flag.code })}
            hint={`${flag.description} · ${t("platform.flags.overrides", { count: flag.override_count })}`}
            checked={flag.default_enabled}
            stateLabel={
              flag.default_enabled
                ? t("platform.flags.onByDefault")
                : t("platform.flags.offByDefault")
            }
            onCheckedChange={(on) => toggle.mutate({ flag, on })}
          />
        </Card>
      ))}
    </div>
  );
}
