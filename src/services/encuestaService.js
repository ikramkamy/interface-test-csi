const SATISFACCION = ['Muy satisfecho', 'Satisfecho', 'Insatisfecho', 'Muy insatisfecho']
const EXPECTATIVAS = ['Superó mis expectativas', 'Cumplió mis expectativas', 'No cumplió mis expectativas']
const SI_NO = ['Sí', 'No']

const QUESTIONNAIRES = {
  PV: [
    {
      id: 'q1_osat',
      titulo: 'Pensando en esta visita, ¿qué tan satisfecho(a) está con su experiencia en el Taller Oficial?',
      campos: [{ name: 'question_1', code: 'OSAT', tipo: 'nps' }],
    },
    {
      id: 'q2_reco_over',
      titulo: 'Basándose en su experiencia, ¿qué tan probable es que recomiende este concesionario?',
      campos: [
        { name: 'question_2', code: 'RECO', tipo: 'nps' },
        {
          name: 'question_3',
          code: 'OVER',
          tipo: 'texto',
          titulo: 'Por favor, compártanos qué le gustó de su experiencia y qué podría mejorarse.',
          placeholder: 'Respuesta opcional',
        },
      ],
    },
    {
      id: 'q4_reas',
      titulo: '¿Cuáles fueron los motivos de esta visita?',
      ayuda: 'Seleccione todo lo que corresponda.',
      campos: [
        {
          name: 'question_4',
          code: 'REAS',
          tipo: 'opciones_multiple',
          opciones: [
            'Servicio de mantenimiento',
            'Reparación',
            'Campaña de revisión de la marca (Recall)',
            'Instalación de accesorios',
            'Trabajos de carrocería (desabolladura y pintura)',
            'Otro',
          ],
        },
        {
          name: 'question_4_specify',
          code: 'REAS_OTRO',
          tipo: 'texto',
          placeholder: 'Por favor, especifique',
          condicional: { campo: 'question_4', valor: 'Otro' },
        },
      ],
    },
    {
      id: 'q5_q6_q7_sat',
      titulo: '¿Qué tan satisfecho(a) está con:',
      campos: [
        {
          name: 'question_5',
          code: 'FACILITIES',
          tipo: 'opciones',
          titulo: 'las instalaciones del taller oficial (recepción de servicios, estacionamiento de clientes, zona de espera, etc.)',
          opciones: SATISFACCION,
        },
        {
          name: 'question_6',
          code: 'STAF',
          tipo: 'opciones',
          titulo: 'la cortesía y la amabilidad del personal del taller de servicio',
          opciones: SATISFACCION,
        },
        {
          name: 'question_7',
          code: 'COMPETENCE',
          tipo: 'opciones',
          titulo: 'las competencias (profesionalismo y conocimientos) del Asesor de Servicio',
          opciones: SATISFACCION,
        },
      ],
    },
    {
      id: 'q8_q12_work_restitution',
      titulo: 'Con respecto a esta visita al taller:',
      campos: [
        {
          name: 'question_8',
          code: 'WORK',
          tipo: 'opciones',
          titulo: 'La calidad de los servicios prestados por este taller…',
          opciones: EXPECTATIVAS,
        },
        {
          name: 'question_12',
          code: 'RESTITUTION',
          tipo: 'opciones',
          titulo: 'El estado de su vehículo al momento de la restitución, incluida la limpieza…',
          opciones: EXPECTATIVAS,
        },
      ],
    },
    {
      id: 'q9_ffxv',
      titulo: '¿Se completó correctamente todo el trabajo solicitado durante esta visita?',
      campos: [{ name: 'question_9', code: 'FFXV', tipo: 'opciones', opciones: SI_NO }],
    },
    {
      id: 'q10_expl',
      titulo: '¿Qué tan satisfecho(a) está con la explicación de los trabajos realizados y los costos correspondientes?',
      campos: [{ name: 'question_10', code: 'EXPL', tipo: 'opciones', opciones: EXPECTATIVAS }],
    },
    {
      id: 'q11_timing',
      titulo: '¿Estaba listo su vehículo en el momento acordado inicialmente?',
      campos: [{ name: 'question_11', code: 'TIMING', tipo: 'opciones', opciones: ['Sí', 'No, y no me informaron', 'No, y me informaron'] }],
    },
    {
      id: 'q13_care',
      titulo: 'Posterior al servicio, ¿recibió un contacto (vía WhatsApp, teléfono, e-mail) de su concesionario para asegurarse de que todo cumplía con sus expectativas?',
      campos: [{ name: 'question_13', code: 'CARE', tipo: 'opciones', opciones: SI_NO }],
    },
    {
      id: 'q14_fver',
      titulo: 'Por favor, comparta cualquier comentario adicional o reflexión final sobre su experiencia en el Servicio.',
      campos: [{ name: 'question_14', code: 'FVER', tipo: 'texto', placeholder: 'Respuesta opcional' }],
    },
  ],
  VN: [
    {
      id: 'q1_osat',
      titulo: '¿Qué tan satisfecho(a) está con la experiencia general de compra de su nuevo vehículo en el concesionario?',
      campos: [{ name: 'question_1', code: 'OSAT', tipo: 'nps' }],
    },
    {
      id: 'q2_reco_over',
      titulo: 'Basándose en su experiencia, ¿qué tan probable es que recomiende este concesionario?',
      campos: [
        { name: 'question_2', code: 'RECO', tipo: 'nps' },
        {
          name: 'question_3',
          code: 'OVER',
          tipo: 'texto',
          titulo: 'Por favor, compártanos qué le gustó de su experiencia y qué podría mejorarse.',
          placeholder: 'Respuesta opcional',
        },
      ],
    },
    {
      id: 'q4_q5_sat',
      titulo: '¿Qué tan satisfecho(a) está con:',
      campos: [
        {
          name: 'question_4',
          code: 'STAF',
          tipo: 'opciones',
          titulo: 'la cortesía y amabilidad del Asesor Comercial',
          opciones: SATISFACCION,
        },
        {
          name: 'question_5',
          code: 'NEED',
          tipo: 'opciones',
          titulo: 'las competencias (profesionalismo y conocimientos) del Asesor Comercial',
          opciones: SATISFACCION,
        },
      ],
    },
    {
      id: 'q6_testdrive',
      titulo: '¿Le ofrecieron una prueba de manejo (Test Drive)?',
      campos: [{ name: 'question_6', code: 'TESTDRIVE', tipo: 'opciones', opciones: ['Sí, me la ofrecieron espontáneamente', 'Sí, después de pedirla', 'No, y la hubiera necesitado', 'No, pero no lo necesitaba'] }],
    },
    {
      id: 'q7_order_delivery_info',
      titulo: '¿Qué tan satisfecho(a) se encuentra con la información entregada entre la compra y la entrega de su vehículo nuevo?',
      campos: [{ name: 'question_7', code: 'ORDER_DELIVERY_INFO', tipo: 'opciones', opciones: SATISFACCION }],
    },
    {
      id: 'q8_q9_delivery',
      titulo: 'Sobre la entrega de su vehículo nuevo:',
      campos: [
        {
          name: 'question_8',
          code: 'CLIN',
          tipo: 'opciones',
          titulo: '¿En qué estado se encontraba su vehículo en el momento de la entrega?',
          opciones: EXPECTATIVAS,
        },
        {
          name: 'question_9',
          code: 'GIVE',
          tipo: 'opciones',
          titulo: '¿Qué tan satisfecho(a) quedó con la entrega general?',
          opciones: EXPECTATIVAS,
        },
      ],
    },
    {
      id: 'q10_care',
      titulo: 'Posterior a la entrega, ¿recibió un contacto (vía WhatsApp, teléfono, e-mail) de su concesionario para asegurarse de que todo cumplía con sus expectativas?',
      campos: [{ name: 'question_10', code: 'CARE', tipo: 'opciones', opciones: SI_NO }],
    },
    {
      id: 'q11_fver',
      titulo: 'Por favor, comparta cualquier comentario adicional o reflexión final sobre su experiencia de compra.',
      campos: [{ name: 'question_11', code: 'FVER', tipo: 'texto', placeholder: 'Respuesta opcional' }],
    },
  ],
}

const INVITATIONS = {
  'demo-pv': { token: 'demo-pv', estudio: 'PV', questionnaire: 'AS_SA_2026', canal: 'QR', client: 'Client test PV' },
  'pv-demo': { token: 'pv-demo', estudio: 'PV', questionnaire: 'AS_SA_2026', canal: 'QR', client: 'Client test PV' },
  'demo-vn': { token: 'demo-vn', estudio: 'VN', questionnaire: 'NV_SA_2026', canal: 'QR', client: 'Client test VN' },
  'vn-demo': { token: 'vn-demo', estudio: 'VN', questionnaire: 'NV_SA_2026', canal: 'QR', client: 'Client test VN' },
}

export const encuestaService = {
  leerToken(token) {
    const normalized = String(token ?? '').trim().toLowerCase()
    if (!normalized) return null
    return INVITATIONS[normalized] ?? null
  },

  cuestionario(estudio) {
    return QUESTIONNAIRES[estudio] ?? []
  },
}
