import type {
  Department,
  Service,
  ServicePoint,
  ServicePointKind,
  SetupI18n,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  CheckboxField,
  EmptyState,
  SelectField,
  SidePanel,
  SwitchField,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextField,
} from "@medilink/ui";
import { DoorOpen, FirstAidKit, PencilSimple, Plus, TreeStructure } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import {
  ConflictNotice,
  errorText,
  fieldErrors,
  isConflict,
  QueryState,
  SetupGate,
  setupKeys,
  useLocalName,
} from "./shared";

const KINDS: ServicePointKind[] = ["room", "desk", "window", "lab", "other"];

/** /settings/services: departments · services · service points (contract §6.1). */
export function CataloguePage() {
  const { t } = useTranslation();
  const api = useApi();
  const departments = useQuery({
    queryKey: setupKeys.departments,
    queryFn: () => api.setup.departments(),
  });
  const services = useQuery({ queryKey: setupKeys.services, queryFn: () => api.setup.services() });
  const points = useQuery({ queryKey: setupKeys.points, queryFn: () => api.setup.points() });
  return (
    <SetupGate codes={["facility.configure"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("setup.settings.sections.services.title")}
          description={t("setup.catalogue.intro")}
          back={{ to: "/settings", label: t("setup.settings.title") }}
        />
        <Tabs defaultValue="services">
          <TabsList aria-label={t("setup.settings.sections.services.title")}>
            <TabsTrigger value="services">{t("setup.catalogue.services")}</TabsTrigger>
            <TabsTrigger value="departments">{t("setup.catalogue.departments")}</TabsTrigger>
            <TabsTrigger value="points">{t("setup.catalogue.points")}</TabsTrigger>
          </TabsList>
          <TabsContent value="services">
            <QueryState query={services}>
              {(s) => (
                <ServicesTab services={s.results} departments={departments.data?.results ?? []} />
              )}
            </QueryState>
          </TabsContent>
          <TabsContent value="departments">
            <QueryState query={departments}>
              {(d) => <DepartmentsTab departments={d.results} />}
            </QueryState>
          </TabsContent>
          <TabsContent value="points">
            <QueryState query={points}>
              {(p) => <PointsTab points={p.results} services={services.data?.results ?? []} />}
            </QueryState>
          </TabsContent>
        </Tabs>
      </div>
    </SetupGate>
  );
}

/** A list with a heading row and an "Add" button; rows open the editor. */
function ListFrame({
  count,
  addLabel,
  onAdd,
  children,
}: {
  count: string;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-body-sm font-semibold text-fg-secondary tabular-nums">{count}</p>
        <Button onClick={onAdd}>
          <Plus aria-hidden="true" weight="bold" />
          {addLabel}
        </Button>
      </div>
      {children}
    </div>
  );
}

function Row({
  title,
  meta,
  badges,
  onEdit,
  editLabel,
}: {
  title: string;
  meta: ReactNode;
  badges?: ReactNode;
  onEdit: () => void;
  editLabel: string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0 sm:flex-nowrap">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{title}</span>
        <span className="text-body-sm text-fg-secondary">{meta}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">{badges}</div>
      <Button variant="ghost" onClick={onEdit} aria-label={`${editLabel}: ${title}`}>
        <PencilSimple aria-hidden="true" />
        {editLabel}
      </Button>
    </li>
  );
}

function NamesFields({
  value,
  onChange,
  errors,
}: {
  value: Partial<SetupI18n>;
  onChange: (v: Partial<SetupI18n>) => void;
  errors: Record<string, string>;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="mb-1 p-0 font-semibold">{t("setup.catalogue.names")}</legend>
      {(["rw", "en", "fr"] as const).map((lang) => (
        <TextField
          key={lang}
          label={t(`setup.languages.${lang}`)}
          value={value[lang] ?? ""}
          onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
          error={errors[`name_i18n.${lang}`] ?? errors.name_i18n}
        />
      ))}
    </fieldset>
  );
}

// ---- services --------------------------------------------------------------------------------

function ServicesTab({
  services,
  departments,
}: {
  services: Service[];
  departments: Department[];
}) {
  const { t } = useTranslation();
  const name = useLocalName();
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const active = services.filter((s) => s.is_active);
  const department = (id: string) => name(departments.find((d) => d.id === id)?.name_i18n);
  return (
    <ListFrame
      count={t("setup.catalogue.serviceCount", { count: active.length })}
      addLabel={t("setup.catalogue.addService")}
      onAdd={() => setEditing("new")}
    >
      {services.length === 0 ? (
        <EmptyState
          icon={FirstAidKit}
          title={t("setup.catalogue.noServicesTitle")}
          description={t("setup.catalogue.noServices")}
        />
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-lg border border-border bg-surface p-0">
          {services.map((s) => (
            <Row
              key={s.id}
              title={name(s.name_i18n)}
              meta={`${department(s.department_id)} · ${t("setup.catalogue.minutes", { count: s.duration_minutes ?? 15 })}`}
              badges={
                <>
                  <Badge tone="neutral">
                    <span className="font-mono">{s.ticket_prefix}</span>
                  </Badge>
                  {s.is_bookable && <Badge tone="brand">{t("setup.catalogue.bookable")}</Badge>}
                  {s.allows_walk_in && <Badge tone="info">{t("setup.catalogue.walkIn")}</Badge>}
                  {!s.is_active && <Badge tone="neutral">{t("setup.catalogue.retired")}</Badge>}
                </>
              }
              onEdit={() => setEditing(s)}
              editLabel={t("setup.edit")}
            />
          ))}
        </ul>
      )}
      {editing && (
        <ServiceEditor
          service={editing === "new" ? null : editing}
          departments={departments}
          onClose={() => setEditing(null)}
        />
      )}
    </ListFrame>
  );
}

function ServiceEditor({
  service,
  departments,
  onClose,
}: {
  service: Service | null;
  departments: Department[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const name = useLocalName();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name_i18n: service?.name_i18n ?? { rw: "", en: "", fr: "" },
    department_id: service?.department_id ?? departments[0]?.id ?? "",
    ticket_prefix: service?.ticket_prefix ?? "",
    duration_minutes: service?.duration_minutes ?? 15,
    is_bookable: service?.is_bookable ?? true,
    allows_walk_in: service?.allows_walk_in ?? true,
    allows_remote_join: service?.allows_remote_join ?? false,
  });
  const [warning, setWarning] = useState<string>();
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: setupKeys.services });
    void queryClient.invalidateQueries({ queryKey: setupKeys.checklist });
  };
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        name_i18n: form.name_i18n,
        ticket_prefix: form.ticket_prefix.toUpperCase(),
      };
      return service
        ? api.setup.updateService(service.id, { ...body, version: service.version })
        : api.setup.addService(body);
    },
    onSuccess: () => {
      done();
      onClose();
    },
  });
  const retire = useMutation({
    mutationFn: () =>
      api.setup.updateService(service!.id, { version: service!.version, is_active: false }),
    onSuccess: (result) => {
      done();
      const ended = result.warnings.find((w) => w.kind === "templates_ended");
      if (ended) setWarning(t("setup.catalogue.templatesEnded", { count: ended.count ?? 0 }));
      else onClose();
    },
  });
  const errors = fieldErrors(save.error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const formId = "service-editor";
  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={service ? name(service.name_i18n) : t("setup.catalogue.addService")}
      closeLabel={t("setup.close")}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          {service?.is_active ? (
            <Button variant="danger" onClick={() => retire.mutate()} disabled={retire.isPending}>
              {t("setup.catalogue.retire")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" form={formId} disabled={save.isPending}>
            {t("setup.save")}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        {isConflict(save.error) && <ConflictNotice onReload={done} />}
        {warning && (
          <Alert tone="warning" role="status">
            {warning}
          </Alert>
        )}
        <NamesFields
          value={form.name_i18n}
          onChange={(v) => setForm((f) => ({ ...f, name_i18n: { rw: "", en: "", fr: "", ...v } }))}
          errors={errors}
        />
        <SelectField
          label={t("setup.catalogue.department")}
          value={form.department_id}
          onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
          error={errors.department_id}
        >
          {departments
            .filter((d) => d.is_active !== false)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {name(d.name_i18n)}
              </option>
            ))}
        </SelectField>
        <div className="flex flex-wrap gap-4">
          <TextField
            label={t("setup.catalogue.prefix")}
            hint={t("setup.catalogue.prefixHint")}
            maxLength={3}
            value={form.ticket_prefix}
            onChange={(e) =>
              setForm((f) => ({ ...f, ticket_prefix: e.target.value.toUpperCase() }))
            }
            error={errors.ticket_prefix}
            className="w-40"
            inputClassName="font-mono uppercase"
          />
          <TextField
            label={t("setup.catalogue.duration")}
            type="number"
            min={5}
            max={240}
            value={String(form.duration_minutes)}
            onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) }))}
            error={errors.duration_minutes}
            className="w-40"
            inputClassName="tabular-nums"
          />
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <SwitchField
            label={t("setup.catalogue.bookable")}
            checked={form.is_bookable}
            onCheckedChange={(v) => setForm((f) => ({ ...f, is_bookable: v }))}
          />
          <SwitchField
            label={t("setup.catalogue.walkIn")}
            checked={form.allows_walk_in}
            onCheckedChange={(v) => setForm((f) => ({ ...f, allows_walk_in: v }))}
          />
          <SwitchField
            label={t("setup.catalogue.remoteJoin")}
            checked={form.allows_remote_join}
            onCheckedChange={(v) => setForm((f) => ({ ...f, allows_remote_join: v }))}
          />
        </div>
        {(save.isError || retire.isError) &&
          !isConflict(save.error) &&
          Object.keys(errors).length === 0 && (
            <Alert tone="danger" role="alert">
              {errorText(save.error ?? retire.error, t("setup.failed"))}
            </Alert>
          )}
      </form>
    </SidePanel>
  );
}

// ---- departments -----------------------------------------------------------------------------

function DepartmentsTab({ departments }: { departments: Department[] }) {
  const { t } = useTranslation();
  const name = useLocalName();
  const [editing, setEditing] = useState<Department | "new" | null>(null);
  return (
    <ListFrame
      count={t("setup.catalogue.departmentCount", {
        count: departments.filter((d) => d.is_active !== false).length,
      })}
      addLabel={t("setup.catalogue.addDepartment")}
      onAdd={() => setEditing("new")}
    >
      {departments.length === 0 ? (
        <EmptyState
          icon={TreeStructure}
          title={t("setup.catalogue.noDepartmentsTitle")}
          description={t("setup.catalogue.noDepartments")}
        />
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-lg border border-border bg-surface p-0">
          {departments.map((d) => (
            <Row
              key={d.id}
              title={name(d.name_i18n)}
              meta={[d.name_i18n.rw, d.name_i18n.fr].filter(Boolean).join(" · ")}
              badges={
                d.is_active === false && (
                  <Badge tone="neutral">{t("setup.catalogue.retired")}</Badge>
                )
              }
              onEdit={() => setEditing(d)}
              editLabel={t("setup.edit")}
            />
          ))}
        </ul>
      )}
      {editing && (
        <DepartmentEditor
          department={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </ListFrame>
  );
}

function DepartmentEditor({
  department,
  onClose,
}: {
  department: Department | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const name = useLocalName();
  const queryClient = useQueryClient();
  const [names, setNames] = useState<Partial<SetupI18n>>(department?.name_i18n ?? {});
  const [active, setActive] = useState(department?.is_active !== false);
  const save = useMutation({
    mutationFn: () =>
      department
        ? api.setup.updateDepartment(department.id, {
            name_i18n: names as SetupI18n,
            is_active: active,
          })
        : api.setup.addDepartment({ name_i18n: names as SetupI18n }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: setupKeys.departments });
      void queryClient.invalidateQueries({ queryKey: setupKeys.checklist });
      onClose();
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={department ? name(department.name_i18n) : t("setup.catalogue.addDepartment")}
      closeLabel={t("setup.close")}
      footer={
        <Button type="submit" form="department-editor" disabled={save.isPending}>
          {t("setup.save")}
        </Button>
      }
    >
      <form
        id="department-editor"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-col gap-5"
      >
        <NamesFields value={names} onChange={setNames} errors={errors} />
        {department && (
          <SwitchField
            label={t("setup.catalogue.active")}
            hint={t("setup.catalogue.retireDepartmentHint")}
            checked={active}
            onCheckedChange={setActive}
          />
        )}
        {errors.is_active && (
          <Alert tone="warning" role="alert">
            {errors.is_active}
          </Alert>
        )}
        {save.isError && Object.keys(errors).length === 0 && (
          <Alert tone="danger" role="alert">
            {errorText(save.error, t("setup.failed"))}
          </Alert>
        )}
      </form>
    </SidePanel>
  );
}

// ---- service points --------------------------------------------------------------------------

function PointsTab({ points, services }: { points: ServicePoint[]; services: Service[] }) {
  const { t } = useTranslation();
  const name = useLocalName();
  const [editing, setEditing] = useState<ServicePoint | "new" | null>(null);
  return (
    <ListFrame
      count={t("setup.catalogue.pointCount", {
        count: points.filter((p) => p.is_active !== false).length,
      })}
      addLabel={t("setup.catalogue.addPoint")}
      onAdd={() => setEditing("new")}
    >
      {points.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title={t("setup.catalogue.noPointsTitle")}
          description={t("setup.catalogue.noPoints")}
        />
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-lg border border-border bg-surface p-0">
          {points.map((p) => (
            <Row
              key={p.id}
              title={p.name}
              meta={
                (p.service_ids ?? [])
                  .map((id) => name(services.find((s) => s.id === id)?.name_i18n))
                  .join(", ") || t("setup.catalogue.noServicesLinked")
              }
              badges={<Badge tone="neutral">{t(`setup.catalogue.kinds.${p.kind}`)}</Badge>}
              onEdit={() => setEditing(p)}
              editLabel={t("setup.edit")}
            />
          ))}
        </ul>
      )}
      {editing && (
        <PointEditor
          point={editing === "new" ? null : editing}
          services={services}
          onClose={() => setEditing(null)}
        />
      )}
    </ListFrame>
  );
}

function PointEditor({
  point,
  services,
  onClose,
}: {
  point: ServicePoint | null;
  services: Service[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const name = useLocalName();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: point?.name ?? "",
    kind: point?.kind ?? "room",
    service_ids: point?.service_ids ?? [],
  });
  const save = useMutation({
    mutationFn: () => (point ? api.setup.updatePoint(point.id, form) : api.setup.addPoint(form)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: setupKeys.points });
      void queryClient.invalidateQueries({ queryKey: setupKeys.checklist });
      onClose();
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={point ? point.name : t("setup.catalogue.addPoint")}
      closeLabel={t("setup.close")}
      footer={
        <Button type="submit" form="point-editor" disabled={save.isPending}>
          {t("setup.save")}
        </Button>
      }
    >
      <form
        id="point-editor"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-col gap-5"
      >
        <TextField
          label={t("setup.catalogue.pointName")}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          error={errors.name}
        />
        <SelectField
          label={t("setup.catalogue.kind")}
          value={form.kind}
          onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as ServicePointKind }))}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`setup.catalogue.kinds.${k}`)}
            </option>
          ))}
        </SelectField>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 p-0 font-semibold">{t("setup.catalogue.linkedServices")}</legend>
          {services
            .filter((s) => s.is_active)
            .map((s) => (
              <CheckboxField
                key={s.id}
                label={name(s.name_i18n)}
                checked={form.service_ids.includes(s.id)}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    service_ids: e.target.checked
                      ? [...f.service_ids, s.id]
                      : f.service_ids.filter((x) => x !== s.id),
                  }))
                }
              />
            ))}
        </fieldset>
        {save.isError && Object.keys(errors).length === 0 && (
          <Alert tone="danger" role="alert">
            {errorText(save.error, t("setup.failed"))}
          </Alert>
        )}
      </form>
    </SidePanel>
  );
}
