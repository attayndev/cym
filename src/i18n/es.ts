import type { Dict } from '@/i18n';

export const es: Partial<Dict> = {
  // Tabs
  'tab.today': 'Hoy',
  'tab.people': 'Personas',
  'tab.health': 'Salud',
  'tab.card': 'Mi tarjeta',
  'tab.settings': 'Ajustes',

  // Health labels
  'health.warm': 'Cercana',
  'health.cooling': 'Enfriándose',
  'health.atRisk': 'En riesgo',
  'health.cold': 'Fría',

  // Categories
  'category.professional': 'Profesional',
  'category.friend': 'Amistad',
  'category.family': 'Familia',
  'category.mentor': 'Mentor',
  'category.client': 'Cliente',
  'category.other': 'Otro',

  // Relative time
  'time.today': 'hoy',
  'time.tomorrow': 'mañana',
  'time.yesterday': 'ayer',
  'time.inDays': 'en {n} días',
  'time.daysAgo': 'hace {n} días',
  'time.monthAgo': 'hace un mes',
  'time.monthsAgo': 'hace {n} meses',
  'time.yearAgo': 'hace un año',
  'time.yearsAgo': 'hace {n} años',

  // Shared
  'common.back': 'Atrás',
  'common.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.delete': 'Eliminar',
  'common.lastTouch': 'último contacto {when}',

  // Today
  'today.title': 'El momento justo,\nel gesto justo.',
  'today.teaser.badge': '{count} momentos esperando',
  'today.teaser.headline':
    'Alguien de tu círculo cumple años esta semana. Otra relación está a punto de enfriarse.',
  'today.teaser.body':
    'Call Your Mom detecta la ocasión adecuada — un cumpleaños, una promesa por cumplir, una relación que se enfría — y te da el gesto exacto con el mensaje ya redactado.',
  'today.teaser.cta': 'Activar el motor de recordatorios',
  'today.empty.allWarm':
    'Hoy no necesitas hacer nada. Todas tus relaciones están cercanas — disfrútalas.',
  'today.empty.noContacts':
    'Aún no hay nadie con quien reconectar. Agrega a las personas que te importan y los momentos justos aparecerán aquí.',
  'today.section.worthActingOn': 'Vale la pena actuar',
  'today.section.whenMinute': 'Cuando tengas un minuto',
  'today.capture': 'Captura a alguien que acabas de conocer',

  // People
  'people.title': 'Personas',
  'people.search': 'Buscar personas o empresas',
  'people.import': 'Importar de tu agenda',
  'people.importing': 'Importando…',
  'people.section.needsAttention': 'Necesitan atención',
  'people.section.doingFine': 'Van bien',
  'people.empty.title': 'Aún no hay personas',
  'people.empty.body':
    'Captura a alguien que acabas de conocer o importa tu agenda para empezar.',
  'people.import.imported': 'Se importaron {count} contactos',
  'people.import.importedBody':
    'Llegaron sin contexto — agrega por qué importa cada uno cuando puedas.',
  'people.import.nothing': 'Nada nuevo para importar',
  'people.sync': 'Sincronizar contactos',
  'people.syncing': 'Sincronizando…',
  'people.sync.result': '{imported} entran, {exported} salen',
  'people.sync.upToDate': 'Contactos al día',

  // Nudge card
  'nudge.kind.moment': 'El momento',
  'nudge.kind.drifting': 'Distanciándose',
  'nudge.writeIt': 'Escribir',
  'nudge.snooze': 'Posponer',
  'nudge.notNow': 'Ahora no',

  // Nudge content
  'nudgec.birthday.headline': 'Es el cumpleaños de {name} 🎂',
  'nudgec.birthday.reason': 'Su cumpleaños está a la vuelta de la esquina.',
  'nudgec.birthday.action.family': 'Llama a {name} para desearle feliz cumpleaños',
  'nudgec.birthday.action.pro': 'Envía a {name} una nota de cumpleaños y propón verse',
  'nudgec.commitment.headline': 'Le hiciste una promesa a {name}',
  'nudgec.commitment.reason': 'Te comprometiste: {commitment}',
  'nudgec.commitment.action': 'Cúmplelo: "{commitment}"',
  'nudgec.reconnect.headline': '{months} meses desde que conociste a {name}',
  'nudgec.reconnect.reason.where': 'Se conocieron en {where}',
  'nudgec.reconnect.reason.generic': 'Un momento natural para reaparecer',
  'nudgec.reconnect.action.where': 'Envía una nota de "he pensado en ti" — menciona {where}',
  'nudgec.reconnect.action.generic': 'Envía a {name} una breve nota de "he pensado en ti"',
  'nudgec.decay.headline': '{name} se está distanciando',
  'nudgec.decay.reason': 'Sin contacto en {days} días — tu ritmo es cada {cadence}',
  'nudgec.decay.action.family': 'Llama rápido a {name}',
  'nudgec.decay.action.friend': 'Escríbele a {name} algo que te recordó a esa persona',
  'nudgec.decay.action.pro': 'Envía a {name} una breve nota para saludar',

  // Notifications
  'notify.digest.title': '{count} momentos que vale la pena atender',
  'notify.digest.body': 'Empezando por: {action}',
  'notify.birthday.title': 'Es el cumpleaños de {name} 🎂',
  'notify.birthday.body': 'Un buen día para escribir. Abre la app para un borrador listo.',

  // Draft fallback templates
  'draft.signoff': 'Un abrazo,',
  'draft.tpl.birthday.family':
    '¡¡Feliz cumpleaños, {name}!! Te llamo más tarde — no me dejes en visto. Te quiero.',
  'draft.tpl.birthday.pro':
    '¡Feliz cumpleaños, {name}! Espero que lo celebres como se debe. Ha pasado mucho — me encantaría que nos pongamos al día pronto y saber cómo te va.',
  'draft.tpl.commitment':
    'Hola {name} — te escribo por lo que prometí: {commitment}. Lo concreto esta semana — te cuento pronto.',
  'draft.tpl.reconnect.where':
    'Hola {name} — hoy me acordé de ti. Ha pasado un tiempo desde {where}. ¿Cómo has estado? Me encantaría que nos pongamos al día.',
  'draft.tpl.checkin.casual':
    'Hola {name} — pensando en ti. Ha pasado demasiado tiempo. ¿Te llamo esta semana?',
  'draft.tpl.checkin.pro':
    'Hola {name} — ha pasado un tiempo y quería saludarte. ¿Cómo va todo por tu lado? Sería genial ponernos al día pronto.',

  // Dashboard
  'dashboard.title': 'Salud de relaciones',
  'dashboard.gate.headline': 'Mira qué relaciones se están enfriando en silencio',
  'dashboard.gate.body':
    'El panel de seguimiento clasifica a todos tus conocidos en cercana, enfriándose, en riesgo y fría — para que nada muera por descuido.',
  'dashboard.gate.cta': 'Desbloquear con Pro',
  'dashboard.bringBack': 'Devuélvelas a cercanas',
  'dashboard.empty': 'Todos están cercanos o enfriándose. De eso se trata — sigue así.',
  'dashboard.emptyNoContacts': 'Agrega personas y su salud aparecerá aquí.',

  // Card
  'card.title': 'Mi tarjeta',
  'card.subtitle':
    'Deja que la escaneen — cualquier cámara te agrega directo a sus contactos.',
  'card.share.subtitle':
    'Al escanear se abre tu tarjeta: pueden guardarte y compartir sus datos contigo al momento.',
  'card.share.rotate': 'Nuevo enlace',
  'card.share.rotateConfirm': 'Toca de nuevo: el QR anterior dejará de funcionar',
  'card.edit': 'Editar datos',
  'card.editHeading': 'Editar tarjeta',
  'card.save': 'Guardar tarjeta',

  // Personas
  'persona.title': 'Personas',
  'persona.subtitle':
    'Cada persona es su propio grafo de relaciones: su propia gente, tarjeta y ritmos.',
  'persona.switcher.title': 'Viendo como',
  'persona.switcher.manage': 'Gestionar personas',
  'persona.new': 'Nueva persona',
  'persona.save': 'Guardar',
  'persona.cancel': 'Cancelar',
  'persona.default': 'Predeterminada',
  'persona.active': 'Activa',
  'persona.use': 'Cambiar a',
  'persona.setDefault': 'Hacer predeterminada',
  'persona.delete': 'Eliminar',
  'persona.deleteConfirm': '¿Eliminar de verdad?',
  'persona.deleteBody': 'Su gente pasa a tu persona predeterminada. Toca de nuevo para confirmar.',
  'persona.contactCount': '{n} personas',

  // Exchange inbox
  'inbox.title': 'Desde tu tarjeta · {n}',
  'inbox.accept': 'Añadir',
  'inbox.viaCard': 'Compartió sus datos con tu QR',

  // Share landing page (public)
  'share.brand': 'Call Your Mom',
  'share.notFound': 'Este enlace de tarjeta ya no está activo. Pide uno nuevo.',
  'share.unavailable': 'La tarjeta no se puede cargar ahora mismo.',
  'share.save': 'Guardar a {name} en contactos',
  'share.exchange.title': 'Comparte los tuyos',
  'share.exchange.body': 'Deja tus datos y {name} los tendrá la próxima vez que abra la app.',
  'share.exchange.note': '¿Algo que valga la pena recordar? (dónde se conocieron, de qué hablaron)',
  'share.exchange.submit': 'Compartir mis datos',
  'share.exchange.sending': 'Enviando…',
  'share.exchange.thanksTitle': 'Enviado',
  'share.exchange.thanks': '{name} tendrá tus datos la próxima vez que abra la app.',
  'share.exchange.error': 'No se envió. Inténtalo de nuevo.',

  // Fields
  'field.name': 'Nombre',
  'field.tagline': 'Lema',
  'field.firstName': 'Nombre',
  'field.lastName': 'Apellido',
  'field.email': 'Correo',
  'field.phone': 'Teléfono',
  'field.company': 'Empresa',
  'field.role': 'Cargo',
  'field.city': 'Ciudad',
  'field.birthday': 'Cumpleaños (MM-DD, si lo sabes)',

  // Capture
  'capture.step0.title': '¿A quién conociste?',
  'capture.next.context': 'Siguiente: el contexto',
  'capture.step1.title': 'Captúralo mientras está fresco',
  'capture.step1.body':
    'Esta es la parte que toda otra app omite — y el combustible de cada recordatorio futuro.',
  'capture.field.whereMet': '¿Dónde se conocieron?',
  'capture.field.discussed': '¿De qué hablaron?',
  'capture.field.whyMatters': '¿Por qué importa?',
  'capture.field.commitment': '¿A qué te comprometiste?',
  'capture.field.whereMet.ph': 'La cena de fundadores en...',
  'capture.field.commitment.ph': 'Presentarle a...',
  'capture.due.label': '¿Para cuándo?',
  'capture.due.tomorrow': 'Mañana',
  'capture.due.in3days': 'En 3 días',
  'capture.due.nextWeek': 'La próxima semana',
  'capture.next.keep': 'Siguiente: cómo mantener el vínculo',
  'capture.step2.title': '¿Cómo mantenemos esto cálido?',
  'capture.category.label': 'Categoría',
  'capture.importance.label': '¿Cuánto importa esta persona?',
  'importance.1': 'Mantener cerca',
  'importance.2': 'Importante',
  'importance.3': 'Círculo íntimo',
  'capture.cadence.label': 'Mantener contacto cada…',
  'cadence.days': '{n} días',
  'cadence.month': 'mes',
  'cadence.2months': '2 meses',
  'cadence.quarter': 'trimestre',
  'cadence.6months': '6 meses',
  'capture.cadence.suggestion': 'Sugerido para {category}: cada {n} días',
  'capture.save': 'Guardar contacto',

  // Contact detail
  'contact.notFound': 'Contacto no encontrado.',
  'contact.logTouchpoint': 'Registrar un contacto',
  'log.call': 'Llamada',
  'log.text': 'Mensaje',
  'log.email': 'Correo',
  'log.coffee': 'Café',
  'log.met': 'Se conocieron',
  'log.meeting': 'Reunión',
  'contact.context.title': 'El contexto',
  'contact.context.whereMet': 'Dónde se conocieron',
  'contact.context.discussed': 'De qué hablaron',
  'contact.context.whyMatters': 'Por qué importa',
  'contact.committedTo': 'Te comprometiste a: {commitment}',
  'contact.committedDue': 'Te comprometiste a: {commitment} — para {date}',
  'contact.context.empty':
    'Sin contexto capturado. La próxima vez que hablen, anota por qué importa esta persona — tu yo futuro lo agradecerá.',
  'contact.history': 'Historial',
  'contact.noHistory': 'Aún no hay interacciones registradas.',
  'contact.edit': 'Editar',
  'contact.delete': 'Eliminar contacto',
  'contact.delete.confirm': '¿Eliminar a {name}?',
  'contact.delete.confirmBody':
    'Esto elimina a la persona y todo su contexto e historial. No se puede deshacer.',
  'contact.cadenceEvery': 'cada {n} días',

  // Edit contact
  'edit.title': 'Editar contacto',
  'edit.context.title': 'El contexto',
  'edit.save': 'Guardar cambios',

  // Nudge composer
  'compose.notFound': 'Recordatorio no encontrado.',
  'compose.channel.text': 'Mensaje',
  'compose.channel.text.disabled': 'Mensaje (sin número)',
  'compose.channel.email': 'Correo',
  'compose.channel.email.disabled': 'Correo (sin dirección)',
  'compose.yourDraft': 'Tu borrador',
  'compose.source.ai': 'Redactado a partir de tus notas',
  'compose.source.template': 'Redactado a partir de tus notas',
  'compose.writing': 'Redactando con lo que capturaste…',
  'compose.openMail': 'Abrir en Correo',
  'compose.openMessages': 'Abrir en Mensajes',
  'compose.markSent': 'Marcar como enviado',

  // Paywall
  'paywall.headline': 'Recordar es difícil.\nNosotros lo hacemos por ti.',
  'paywall.body':
    'Capturar contactos es gratis, para siempre. Pro es la capa de inteligencia: detecta el momento justo y te da el gesto.',
  'paywall.feature.nudges.title': 'Recordatorios según la ocasión',
  'paywall.feature.nudges.body':
    'Cumpleaños, promesas por cumplir, relaciones que se distancian — en el momento justo, con el gesto justo.',
  'paywall.feature.drafts.title': 'Mensajes, ya empezados',
  'paywall.feature.drafts.body':
    'Cada recordatorio trae un borrador hecho con el contexto que capturaste — edítalo y envíalo.',
  'paywall.feature.dashboard.title': 'El panel de seguimiento',
  'paywall.feature.dashboard.body':
    'Mira exactamente qué relaciones están cercanas, enfriándose, en riesgo o frías.',
  'paywall.feature.personas.title': 'Personas',
  'paywall.feature.personas.body':
    'Grafos separados para tu yo fundador, tu yo del trabajo y tu yo personal, cada uno con su tarjeta, su gente y sus ritmos.',
  'paywall.feature.email.title': 'Sincronización de correo (primero Gmail)',
  'paywall.feature.email.body':
    'Las fechas de último contacto se mantienen exactas sin registrar nada a mano.',
  'paywall.price': '$99 / año',
  'paywall.priceSub': 'Una relación reavivada paga una década de esto.',
  'paywall.cta': 'Hazte Pro',
  'paywall.fine': 'Sin anuncios. Nunca. Tus relaciones no están en venta.',

  // Onboarding
  'onboarding.welcome.eyebrow': 'Bienvenido a Call Your Mom',
  'onboarding.welcome.title': 'Evita que se enfríen las\nrelaciones que te importan.',
  'onboarding.welcome.body':
    'Captura a las personas que conoces con el contexto de por qué importan — y te decimos el momento justo y el gesto justo para reconectar.',
  'onboarding.welcome.cta': 'Empezar',
  'onboarding.card.title': 'Configura tu tarjeta',
  'onboarding.card.body':
    'Esto es lo que compartes cuando conoces a alguien. Puedes cambiarlo cuando quieras.',
  'onboarding.card.cta': 'Continuar',
  'onboarding.card.skip': 'Omitir por ahora',
  'onboarding.notify.title': 'No te pierdas el momento',
  'onboarding.notify.body':
    'Enviamos un aviso discreto cuando hay una razón real para contactar — un cumpleaños, una promesa por cumplir. Sin spam, nunca.',
  'onboarding.notify.enable': 'Activar recordatorios',
  'onboarding.notify.later': 'Quizás después',
  'onboarding.start.title': 'Agrega a tu primera persona',
  'onboarding.start.body':
    'Empieza por alguien que importa. O explora con datos de ejemplo.',
  'onboarding.start.capture': 'Agregar a alguien',
  'onboarding.start.import': 'Importar mis contactos',
  'onboarding.start.sample': 'Explorar con datos de ejemplo',

  // Settings
  'settings.title': 'Ajustes',
  'settings.personas': 'Gestionar personas',
  'settings.section.profile': 'Tu perfil',
  'settings.section.notifications': 'Notificaciones',
  'settings.section.subscription': 'Suscripción',
  'settings.section.language': 'Idioma',
  'settings.section.privacy': 'Privacidad',
  'settings.section.data': 'Tus datos',
  'settings.notifications.label': 'Recordatorios para los momentos justos',
  'settings.notifications.web': 'Los recordatorios están disponibles en la app móvil.',
  'settings.notifications.needsPro': 'Los recordatorios vienen con Pro.',
  'settings.subscription.pro': 'Pro — activo',
  'settings.subscription.proBody': 'Gracias por apoyar una app sin anuncios.',
  'settings.subscription.free': 'Plan gratis',
  'settings.subscription.upgrade': 'Mejorar a Pro',
  'settings.privacy.statement':
    'Nunca vendemos tus datos ni mostramos anuncios. Tus relaciones son tuyas. Las conexiones de correo y calendario sincronizan solo fechas y participantes — nunca el contenido de los mensajes.',
  'settings.data.export': 'Exportar mis datos',
  'settings.data.exported': 'Datos listos',
  'settings.data.sample': 'Cargar datos de ejemplo',
  'settings.data.reset': 'Eliminar todo',
  'settings.data.reset.confirm': '¿Eliminar todo?',
  'settings.data.reset.confirmBody':
    'Esto elimina permanentemente todos los contactos, contexto e historial de este dispositivo.',
  'settings.editProfile': 'Editar perfil',

  // Sync / account
  'settings.section.account': 'Cuenta y sincronización',
  'settings.account.signedInAs': 'Sincronizado como {email}',
  'settings.account.syncBody':
    'Tus relaciones se respaldan de forma segura y se sincronizan entre dispositivos.',
  'settings.account.signOut': 'Cerrar sesión',
  'settings.account.signIn': 'Inicia sesión para sincronizar entre dispositivos',
  'settings.account.localOnly': 'Guardado solo en este dispositivo.',

  // Auth screen
  'auth.title': 'Sincroniza tu círculo',
  'auth.subtitle':
    'Crea una cuenta para respaldar tus relaciones y usar Call Your Mom en todos tus dispositivos.',
  'auth.signIn': 'Iniciar sesión',
  'auth.webOnlyNote': 'Las cuentas se crean en la app. Inicia sesión con el correo que usaste allí.',
  'auth.signUp': 'Crear cuenta',
  'auth.password': 'Contraseña',
  'auth.working': 'Procesando…',
  'auth.checkEmail': 'Revisa tu correo para confirmar tu cuenta y luego inicia sesión.',
  'auth.error': 'Algo salió mal. Inténtalo de nuevo.',
  'auth.privacyNote':
    'Solo guardamos los datos de tus relaciones — nunca el contenido de los mensajes. Sin anuncios, nunca.',

  // Gmail sync
  'settings.section.gmail': 'Sincronización de correo',
  'gmail.connect': 'Conectar Gmail',
  'gmail.connected': 'Gmail conectado: {email}',
  'gmail.body':
    'Solo leemos fechas y participantes para mantener exacto el "último contacto" — nunca el contenido de tus correos.',
  'gmail.syncNow': 'Sincronizar ahora',
  'gmail.syncing': 'Sincronizando…',
  'gmail.disconnect': 'Desconectar',
  'gmail.connecting': 'Conectando…',
  'gmail.synced': 'Se sincronizaron {count} interacciones nuevas',
  'gmail.syncedNone': 'Todo al día',
  'gmail.error': 'No se pudo conectar Gmail. Inténtalo de nuevo.',
  'gmail.needsAccount': 'Inicia sesión primero para conectar Gmail.',
  'gmail.mobileOnly': 'La sincronización de correo funciona en la app móvil.',
};
