import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { encuestaService } from "@/services/encuestaService";
import { surveyResponseService } from "@/services/surveyResponseService";
import { buildSurveyResponsePayload, lookupGpsCountry, parseCookies } from "@/lib/survey-response";
import type { CampoEncuesta } from "@/services/encuestaService";

const HOJAS = [
  "/survey/css/bootstrap.min.css",
  "/survey/css/style.css",
  "/survey/css/vendors.css",
  "/survey/css/custom.css",
  "/survey/css/leapmotor.css",
];

const CSS_MODALIDADES = `
#wrapped textarea.form-control { font-size: 16px; line-height: 1.5; }
.encuesta_fin, .encuesta_fin .main_question, .encuesta_fin p { text-align: center; }
.encuesta_save_status { clear: both; padding-top: 10px; color: #5b6b67; font-size: 12px; text-align: right; }
.encuesta_save_status--error { color: #a11f17; }
`;

const SAVE_DEBOUNCE_MS = 700;

const valoresMultiples = (valor: string) => valor ? valor.split("||").filter(Boolean) : [];
const serializarMultiples = (valores: string[]) => valores.join("||");
const campoActivo = (campo: CampoEncuesta, respuestas: Record<string, string>) => {
  if (!campo.condicional) return true;
  return valoresMultiples(respuestas[campo.condicional.campo] ?? "").includes(campo.condicional.valor);
};

const useHojasEncuesta = () => {
  useEffect(() => {
    const enlaces = HOJAS.map(href => {
      const el = document.createElement("link");
      el.rel = "stylesheet";
      el.href = href;
      document.head.appendChild(el);
      return el;
    });
    const propia = document.createElement("style");
    propia.textContent = CSS_MODALIDADES;
    document.head.appendChild(propia);
    const previa = document.body.className;
    document.body.className = "style_3";
    return () => {
      enlaces.forEach(el => el.remove());
      propia.remove();
      document.body.className = previa;
    };
  }, []);
};

const EscalaNps = ({ campo, valor, onChange, disabled }: {
  campo: CampoEncuesta;
  valor: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) => (
  <div className="review_block_numbers">
    <ul className="clearfix">
      {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(n => {
        const clase = Number(n) <= 6 ? "nps_bottom" : Number(n) <= 8 ? "nps_middle" : "nps_top";
        const id = `${campo.name}_${n}`;
        return (
          <li key={n}>
            <div className="container_numbers">
              <input type="radio" id={id} name={campo.name} value={n}
                checked={valor === n} disabled={disabled} onChange={() => onChange(n)} />
              <label className={`radio ${clase}`} htmlFor={id}>{n}</label>
            </div>
          </li>
        );
      })}
    </ul>
    <div className="row justify-content-between add_bottom_25">
      <div className="col-5"><em>Muy poco probable</em></div>
      <div className="col-5 text-right"><em>Muy probable</em></div>
    </div>
  </div>
);

const Campo = ({ campo, valor, respuestas, onChange, enLinea, disabled }: {
  campo: CampoEncuesta;
  valor: string;
  respuestas: Record<string, string>;
  onChange: (v: string) => void;
  enLinea?: boolean;
  disabled?: boolean;
}) => {
  if (!campoActivo(campo, respuestas)) return null;
  const multiples = valoresMultiples(valor);

  return (
    <>
      {campo.titulo && <p className={enLinea ? "question_sub question_sub--spaced" : "question_sub"}>{campo.titulo}</p>}
      {campo.tipo === "nps" && <EscalaNps campo={campo} valor={valor} onChange={onChange} disabled={disabled} />}
      {campo.tipo === "opciones" && (
        <div className={enLinea ? "review_block review_block--inline" : "review_block"}>
          <ul>
            {(campo.opciones ?? []).map((o, i) => {
              const id = `${campo.name}_opt_${i + 1}`;
              return (
                <li key={o}>
                  <div className="checkbox_radio_container">
                    <input type="radio" id={id} name={campo.name} value={o}
                      checked={valor === o} disabled={disabled} onChange={() => onChange(o)} />
                    <label className="radio" htmlFor={id} />
                    <label htmlFor={id} className="wrapper">{o}</label>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {campo.tipo === "opciones_multiple" && (
        <div className={enLinea ? "review_block review_block--inline" : "review_block"}>
          <ul>
            {(campo.opciones ?? []).map((o, i) => {
              const id = `${campo.name}_opt_${i + 1}`;
              const checked = multiples.includes(o);
              return (
                <li key={o}>
                  <div className="checkbox_radio_container">
                    <input type="checkbox" id={id} name={campo.name} value={o}
                      checked={checked} disabled={disabled} onChange={() => {
                        const suivant = checked ? multiples.filter(v => v !== o) : [...multiples, o];
                        onChange(serializarMultiples(suivant));
                      }} />
                    <label className="checkbox" htmlFor={id} />
                    <label htmlFor={id} className="wrapper">{o}</label>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {campo.tipo === "texto" && (
        <div className={campo.condicional ? "form-group specify_field" : "form-group"}>
          <textarea name={campo.name} className="form-control" style={{ height: campo.condicional ? 48 : 130 }}
            placeholder={campo.placeholder ?? ""} value={valor} disabled={disabled} onChange={e => onChange(e.target.value)} />
        </div>
      )}
    </>
  );
};

export const EncuestaView = () => {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  useHojasEncuesta();
  const invitacion = useMemo(() => encuestaService.leerToken(token), [token]);
  const pasos = useMemo(
    () => (invitacion ? encuestaService.cuestionario(invitacion.estudio) : []),
    [invitacion],
  );
  const [paso, setPaso] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [questionSeconds, setQuestionSeconds] = useState<Record<string, number>>({});
  const [enviada, setEnviada] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [gps, setGps] = useState<{ latitude: number | null; longitude: number | null; country: string | null }>({ latitude: null, longitude: null, country: null });
  const [interruptions, setInterruptions] = useState(0);

  const respuestasRef = useRef(respuestas);
  const questionSecondsRef = useRef(questionSeconds);
  const pasoRef = useRef(paso);
  const responseStartRef = useRef<string>(new Date().toISOString());
  const stepStartedAt = useRef<number>(Date.now());
  const debounceRef = useRef<number | null>(null);
  const finalizedRef = useRef(false);
  const inactiveRef = useRef(false);

  useEffect(() => { respuestasRef.current = respuestas; }, [respuestas]);
  useEffect(() => { questionSecondsRef.current = questionSeconds; }, [questionSeconds]);
  useEffect(() => { pasoRef.current = paso; }, [paso]);

  useEffect(() => {
    setPaso(0);
    setRespuestas({});
    setQuestionSeconds({});
    setEnviada(false);
    setSaveStatus("idle");
    setSaveError("");
    setGps({ latitude: null, longitude: null, country: null });
    setInterruptions(0);
    finalizedRef.current = false;
    inactiveRef.current = false;
    responseStartRef.current = new Date().toISOString();
    stepStartedAt.current = Date.now();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
  }, [token]);

  useEffect(() => {
    if (!invitacion || !navigator.geolocation) return;
    let alive = true;
    navigator.geolocation.getCurrentPosition(
      position => {
        if (!alive) return;
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        setGps({ latitude, longitude, country: lookupGpsCountry(latitude, longitude) });
      },
      () => {
        if (alive) setGps({ latitude: null, longitude: null, country: null });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
    return () => { alive = false; };
  }, [invitacion]);

  useEffect(() => {
    const markInactive = () => {
      if (inactiveRef.current || enviada || finalizedRef.current) return;
      inactiveRef.current = true;
      setInterruptions(value => value + 1);
    };
    const markActive = () => { inactiveRef.current = false; };
    const visibility = () => document.visibilityState === "hidden" ? markInactive() : markActive();
    window.addEventListener("blur", markInactive);
    window.addEventListener("focus", markActive);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", markInactive);
      window.removeEventListener("focus", markActive);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enviada]);

  const camposActivosPaso = (indice: number, respuestasBase = respuestasRef.current) => {
    const actual = pasos[indice];
    return actual ? actual.campos.filter(c => campoActivo(c, respuestasBase)) : [];
  };

  const contabilizarTiempoPaso = (indice = pasoRef.current) => {
    const campos = camposActivosPaso(indice);
    const elapsed = Math.max(0, (Date.now() - stepStartedAt.current) / 1000);
    stepStartedAt.current = Date.now();
    if (!campos.length || elapsed <= 0) return questionSecondsRef.current;
    const perQuestion = elapsed / campos.length;
    const next = { ...questionSecondsRef.current };
    campos.forEach(c => { next[c.name] = (next[c.name] ?? 0) + perQuestion; });
    questionSecondsRef.current = next;
    setQuestionSeconds(next);
    return next;
  };

  const construirePayload = (completed: boolean, submissionTime: string | null = null, secondsOverride = questionSecondsRef.current) => buildSurveyResponsePayload({
    invitation: invitacion,
    pasos,
    respuestas: respuestasRef.current,
    questionSeconds: secondsOverride,
    isCampoActivo: campoActivo,
    responseStart: responseStartRef.current,
    submissionTime,
    interruptions,
    gps,
    userAgent: navigator.userAgent,
    viewportWidth: window.innerWidth,
    cookies: parseCookies(document.cookie),
    completed,
    rawPayload: {
      source: "EncuestaView React",
      token_present: Boolean(token),
      respuestas: respuestasRef.current,
      gps,
      current_step: pasoRef.current,
    },
  });

  const envoyerPayload = async ({ completed = false, submissionTime = null, secondsOverride = questionSecondsRef.current } = {}) => {
    if (!invitacion || finalizedRef.current && !completed) return null;
    setSaveStatus("saving");
    setSaveError("");
    const payload = construirePayload(completed, submissionTime, secondsOverride);
    try {
      const result = await surveyResponseService.upsert({ invitationToken: token, payload });
      setSaveStatus("saved");
      return result;
    } catch (error) {
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : "Erreur d’envoi Supabase.");
      console.error(error);
      throw error;
    }
  };

  const programmerSauvegarde = () => {
    if (!invitacion || enviada || finalizedRef.current) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      envoyerPayload({ completed: false }).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  };

  useEffect(() => {
    programmerSauvegarde();
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [respuestas, gps, interruptions, invitacion, pasos.length]);

  const changerReponse = (name: string, value: string) => {
    if (enviada || finalizedRef.current) return;
    setRespuestas(r => ({ ...r, [name]: value }));
  };

  const naviguer = async (direction: -1 | 1) => {
    const seconds = contabilizarTiempoPaso();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    await envoyerPayload({ completed: false, secondsOverride: seconds }).catch(() => {});
    setPaso(p => Math.min(Math.max(p + direction, 0), pasos.length - 1));
  };

  const soumettre = async () => {
    const seconds = contabilizarTiempoPaso();
    const submissionTime = new Date().toISOString();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    await envoyerPayload({ completed: true, submissionTime, secondsOverride: seconds });
    finalizedRef.current = true;
    setEnviada(true);
  };

  const actual = pasos[paso];
  const completa = actual?.campos.every(c => !campoActivo(c, respuestas) || c.tipo === "texto" || respuestas[c.name]) ?? false;
  const ultimo = paso === pasos.length - 1;
  const avance = pasos.length ? Math.round(((paso + 1) / pasos.length) * 100) : 0;
  const agrupada = (actual?.campos.filter(c => c.tipo === "opciones" || c.tipo === "opciones_multiple").length ?? 0) > 1;

  return (
    <>
      <header>
        <div className="container-fluid">
          <div className="row align-items-center">
            <div className="col-12">
              <img src="/survey/img/leapmotor_logo.png" alt="Leapmotor" className="brand_logo"
                style={{ height: 58, width: "auto" }} />
            </div>
          </div>
        </div>
      </header>

      <div className="wrapper_centering">
        <div className="container_centering">
          <div className="container">
            <div className="row justify-content-between">
              {!invitacion ? (
                <div className="col-xl-12 col-lg-12">
                  <div className="main_title text-center encuesta_fin">
                    <h3 className="main_question">{t("encuesta.tokenInvalido")}</h3>
                    <p>{t("encuesta.tokenInvalidoSub")}</p>
                  </div>
                </div>
              ) : enviada ? (
                <div className="col-xl-12 col-lg-12">
                  <div className="main_title text-center encuesta_fin">
                    <h3 className="main_question">{t("encuesta.gracias")}</h3>
                    <p>{t("encuesta.graciasSub")}</p>
                  </div>
                </div>
              ) : (
                <div className="col-xl-12 col-lg-12 d-flex align-items-center">
                  <div id="wizard_container">
                    <div id="top-wizard">
                      <div className="progress_wrap mt-1">
                        <div id="progressbar" className="ui-progressbar ui-widget ui-widget-content ui-corner-all">
                          <div className="ui-progressbar-value ui-widget-header ui-corner-left"
                            style={{ width: `${avance}%`, height: "100%" }} />
                        </div>
                        <span className="progress_label">{avance} %</span>
                        <span className="progress_label progress_label--fill" aria-hidden="true"
                          style={{ clipPath: `inset(0 ${100 - avance}% 0 0)`, WebkitClipPath: `inset(0 ${100 - avance}% 0 0)` }}>
                          {avance} %
                        </span>
                      </div>
                    </div>

                    <form id="wrapped" onSubmit={e => e.preventDefault()} autoComplete="off">
                      <div id="middle-wizard">
                        <div className="step">
                          <h3 className="main_question">{actual.titulo}</h3>
                          {actual.ayuda && <p className="text-white" style={{ opacity: .75, fontSize: 13, marginTop: -10 }}>{actual.ayuda}</p>}
                          {actual.campos.map(c => (
                            <Campo key={c.name} campo={c} valor={respuestas[c.name] ?? ""}
                              respuestas={respuestas}
                              enLinea={agrupada}
                              disabled={saveStatus === "saving" && ultimo}
                              onChange={v => changerReponse(c.name, v)} />
                          ))}
                        </div>
                      </div>

                      <div id="bottom-wizard">
                        <button type="button" className="backward text-uppercase float-left"
                          disabled={paso === 0 || saveStatus === "saving"} onClick={() => naviguer(-1)}>
                          {t("encuesta.anterior")}
                        </button>
                        <button type="button" className={`${ultimo ? "submit process" : "forward"} text-uppercase float-right`}
                          disabled={!completa || saveStatus === "saving"}
                          onClick={() => ultimo ? soumettre().catch(() => {}) : naviguer(1)}>
                          {t(ultimo ? "encuesta.enviar" : "encuesta.siguiente")}
                        </button>
                        <div className={`encuesta_save_status ${saveStatus === "error" ? "encuesta_save_status--error" : ""}`}>
                          {saveStatus === "saving" && "Sauvegarde en cours…"}
                          {saveStatus === "saved" && "Brouillon sauvegardé"}
                          {saveStatus === "error" && saveError}
                        </div>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <footer>
        <div className="container-fluid">
          <div className="row">
            <div className="col-md-6">
              ©{new Date().getFullYear()} FANS powered by SATISFACTIVE
            </div>
          </div>
        </div>
      </footer>
    </>
  );
};
