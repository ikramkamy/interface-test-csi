import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { encuestaService } from "@/services/encuestaService";
import { respuestaEncuestaService } from "@/services/respuestaEncuestaService";
import type { PasacionEncuesta } from "@/services/respuestaEncuestaService";
import type { CampoEncuesta } from "@/services/encuestaService";

/**
 * Feuilles de style du questionnaire client, servies depuis `public/survey/`.
 *
 * La page de réponse **est** celle de `survey/venta.html` : mêmes CSS, même
 * balisage, même logo. Elles ne sont chargées que le temps de cette page —
 * bootstrap et `style.css` écraseraient sinon la charte du portail.
 */
const HOJAS = [
  "/survey/css/bootstrap.min.css",
  "/survey/css/style.css",
  "/survey/css/vendors.css",
  "/survey/css/custom.css",
  "/survey/css/leapmotor.css",
];

/**
 * Disposition des modalités sur un écran à plusieurs questions.
 *
 * Une ligne sur grand écran, deux colonnes au téléphone : la règle vit ici,
 * avec la page, plutôt que dans les feuilles reprises du gabarit.
 */
const CSS_MODALIDADES = `
.modalidades_linea { display: flex; flex-wrap: wrap; gap: 10px; }
.modalidades_linea .checkbox_radio_container { flex: 1 1 0; min-width: 0; margin-bottom: 0; }
/* Verbatim : le champ libre se saisit dans un corps confortable — c'est le seul
   endroit où le répondant écrit, et non où il coche. */
#wrapped textarea.form-control { font-size: 16px; line-height: 1.5; }
/* Écran de fin : l'énoncé est un remerciement, il se lit centré. */
.encuesta_fin, .encuesta_fin .main_question, .encuesta_fin p { text-align: center; }
@media (max-width: 767px) {
  .modalidades_linea .checkbox_radio_container { flex: 1 1 calc(50% - 10px); min-width: calc(50% - 10px); }
}
`;

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
    // `style_3` : la classe que porte le corps des pages du questionnaire.
    const previa = document.body.className;
    document.body.className = "style_3";
    return () => {
      enlaces.forEach(el => el.remove());
      propia.remove();
      document.body.className = previa;
    };
  }, []);
};

/** Échelle de 1 à 10 — balisage `review_block_numbers` du questionnaire. */
const EscalaNps = ({ campo, valor, onChange }: {
  campo: CampoEncuesta;
  valor: string;
  onChange: (v: string) => void;
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
                checked={valor === n} onChange={() => onChange(n)} />
              <label className={`radio ${clase}`} htmlFor={id}>{n}</label>
            </div>
          </li>
        );
      })}
    </ul>
  </div>
);

/** Un champ du questionnaire, dans le balisage de la page d'origine. */
const Campo = ({ campo, valor, onChange, enLinea }: {
  campo: CampoEncuesta;
  valor: string;
  onChange: (v: string) => void;
  /**
   * Écran portant plusieurs questions : les modalités se rangent alors sur une
   * seule ligne, pour que les sous-questions restent visibles ensemble.
   */
  enLinea?: boolean;
}) => (
  <>
    {campo.titulo && <h5 className="question_sub">{campo.titulo}</h5>}
    {campo.tipo === "nps" && <EscalaNps campo={campo} valor={valor} onChange={onChange} />}
    {/* Écran groupé : les modalités tiennent sur une ligne, et se rangent sur
        deux au téléphone — quatre colonnes y seraient illisibles. */}
    {campo.tipo === "opciones" && (
      <div className={enLinea ? "form-group modalidades_linea" : "form-group"}>
        {(campo.opciones ?? []).map((o, i) => {
          const id = `${campo.name}_opt_${i + 1}`;
          return (
            <div className="checkbox_radio_container" key={o}>
              <input type="radio" id={id} name={campo.name} value={o}
                checked={valor === o} onChange={() => onChange(o)} />
              <label className="radio" htmlFor={id} />
              <label htmlFor={id} className="wrapper">{o}</label>
            </div>
          );
        })}
      </div>
    )}
    {campo.tipo === "texto" && (
      <div className="form-group">
        <textarea name={campo.name} className="form-control" style={{ height: 130 }}
          placeholder={campo.placeholder ?? ""} value={valor} onChange={e => onChange(e.target.value)} />
      </div>
    )}
  </>
);

/**
 * Réponse à une enquête, ouverte par un lien à jeton.
 *
 * Le jeton porte l'étude et le destinataire : c'est lui, et lui seul, qui
 * décide du questionnaire présenté. La page vit **hors session** — y répondre
 * ne donne accès à rien d'autre.
 */
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
  const [enviada, setEnviada] = useState(false);
  /**
   * Passation en cours : progression, réponses et contexte (IP, système,
   * navigateur, écran, fuseau) sont enregistrés au fil des étapes. C'est cette
   * trace que lit la revue de fraude.
   */
  const pasacion = useRef<PasacionEncuesta | null>(null);
  /** Début de l'étape affichée, pour mesurer le temps passé sur chacune. */
  const abiertaEn = useRef<number>(Date.now());

  useEffect(() => {
    if (!invitacion || !pasos.length) return;
    let vivo = true;
    (async () => {
      const contexto = await respuestaEncuestaService.contexto();
      if (!vivo) return;
      pasacion.current = await respuestaEncuestaService.abrir(invitacion, pasos.length, contexto);
      abiertaEn.current = Date.now();
    })();
    return () => { vivo = false; };
  }, [invitacion, pasos.length]);

  /** Étape franchie : elle part avec sa durée et ce qu'elle a recueilli. */
  const registrarPaso = async (indice: number) => {
    const actual = pasos[indice];
    const enCurso = pasacion.current;
    if (!actual || !enCurso) return;
    const segundos = Math.round((Date.now() - abiertaEn.current) / 1000);
    abiertaEn.current = Date.now();
    const propias = Object.fromEntries(actual.campos.map(c => [c.name, respuestas[c.name] ?? ""]));
    pasacion.current = await respuestaEncuestaService.guardarPaso(
      enCurso, { paso: actual.id, segundos, respuestas: propias }, indice,
    );
  };

  const actual = pasos[paso];
  // Une étape n'est franchie qu'une fois ses champs à modalités renseignés ;
  // le texte libre reste facultatif, comme dans le questionnaire d'origine.
  const completa = actual?.campos.every(c => c.tipo === "texto" || respuestas[c.name]) ?? false;
  const ultimo = paso === pasos.length - 1;
  const avance = pasos.length ? Math.round(((paso + 1) / pasos.length) * 100) : 0;
  /** Étape à plusieurs questions notées : leurs modalités passent en ligne. */
  const agrupada = (actual?.campos.filter(c => c.tipo === "opciones").length ?? 0) > 1;

  return (
    <>
      <header>
        <div className="container-fluid">
          <div className="row align-items-center">
            <div className="col-12">
              {/* Logo de marque, en tête du bandeau vert. La hauteur est posée
                  en ligne : `style.css` fixe autrement celle de l'en-tête. */}
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
                        {/* La piste et son remplissage, comme le plugin d'origine. */}
                        <div id="progressbar" className="ui-progressbar ui-widget ui-widget-content ui-corner-all">
                          <div className="ui-progressbar-value ui-widget-header ui-corner-left"
                            style={{ width: `${avance}%`, height: "100%" }} />
                        </div>
                        {/* Deux calques superposés, comme dans le gabarit : le
                            vert se lit sur la piste claire, la copie blanche
                            n'est révélée que sur la portion remplie. */}
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
                          {actual.campos.map(c => (
                            <Campo key={c.name} campo={c} valor={respuestas[c.name] ?? ""}
                              enLinea={agrupada}
                              onChange={v => setRespuestas(r => ({ ...r, [c.name]: v }))} />
                          ))}
                        </div>
                      </div>

                      <div id="bottom-wizard">
                        <button type="button" className="backward text-uppercase float-left"
                          disabled={paso === 0} onClick={() => setPaso(p => Math.max(0, p - 1))}>
                          {t("encuesta.anterior")}
                        </button>
                        <button type="button" className={`${ultimo ? "submit process" : "forward"} text-uppercase float-right`}
                          disabled={!completa}
                          onClick={async () => {
                            await registrarPaso(paso);
                            if (!ultimo) { setPaso(p => p + 1); return; }
                            if (pasacion.current) pasacion.current = await respuestaEncuestaService.cerrar(pasacion.current);
                            setEnviada(true);
                          }}>
                          {t(ultimo ? "encuesta.enviar" : "encuesta.siguiente")}
                        </button>
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
