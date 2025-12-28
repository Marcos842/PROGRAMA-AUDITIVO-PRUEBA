// CONFIGURACIÓN DE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyD3l6zHseL3COORdmj5cANtFDMLpjGh708",
    authDomain: "almacenamiento-216a8.firebaseapp.com",
    databaseURL: "https://almacenamiento-216a8-default-rtdb.firebaseio.com",
    projectId: "almacenamiento-216a8",
    storageBucket: "almacenamiento-216a8.firebasestorage.app",
    messagingSenderId: "815356507436",
    appId: "1:815356507436:web:aa7e3450a0b10a3554e889"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Variables globales
let recognition;
let isRecording = false;
let db = { conversaciones: [] };
let resultadoProcesado = 0;
let hablanteActual = 'a';
let codigoSalaActual = null;
let salaRef = null;
let presenciaRef = null;
let miPresenciaKey = null;
let misTimestamps = new Set();
let ultimoTextoEnviado = ''; // ✅ NUEVO: Evitar duplicados en móvil
let ultimoTimestampLocal = 0; // ✅ NUEVO: Control adicional de timing

// Inicializar cuando carga la página
document.addEventListener('DOMContentLoaded', function() {
    inicializarReconocimiento();
    cargarHistorial();
    cargarNombresHablantes();
    cargarNombreUsuario();
    configurarBotones();
});

// Cargar nombre de usuario guardado
function cargarNombreUsuario() {
    const nombreGuardado = localStorage.getItem('miNombre');
    if (nombreGuardado) {
        document.getElementById('mi-nombre').value = nombreGuardado;
    }
}

// Guardar nombre de usuario
function guardarNombreUsuario() {
    const nombre = document.getElementById('mi-nombre').value.trim();
    if (nombre) {
        localStorage.setItem('miNombre', nombre);
    }
}

// Conectar a sala con presencia
function conectarSala() {
    const codigoSala = document.getElementById('codigo-sala').value.trim();
    const miNombre = document.getElementById('mi-nombre').value.trim();
    
    if (!codigoSala) {
        alert('Por favor ingresa un código de sala');
        return;
    }
    
    if (!miNombre) {
        alert('Por favor ingresa tu nombre');
        return;
    }
    
    guardarNombreUsuario();
    
    // LIMPIAR PANTALLA Y VARIABLES AL CONECTAR
    document.getElementById('texto-final').innerHTML = '';
    document.getElementById('texto-temporal').innerHTML = '';
    misTimestamps.clear();
    ultimoTextoEnviado = ''; // ✅ NUEVO
    ultimoTimestampLocal = 0; // ✅ NUEVO
    
    codigoSalaActual = codigoSala;
    salaRef = database.ref('salas/' + codigoSala + '/mensajes');
    presenciaRef = database.ref('salas/' + codigoSala + '/presencia');
    
    // Agregar mi presencia
    const miPresencia = presenciaRef.push({
        nombre: miNombre,
        conectado: true,
        timestamp: Date.now()
    });
    
    miPresenciaKey = miPresencia.key;
    miPresencia.onDisconnect().remove();
    
    // Escuchar cambios en personas conectadas
    presenciaRef.on('value', function(snapshot) {
        actualizarListaPersonas(snapshot);
    });
    
    // ESCUCHAR TODOS LOS MENSAJES NUEVOS
    const momentoConexion = Date.now();
    salaRef.orderByChild('timestamp').startAt(momentoConexion).on('child_added', function(snapshot) {
        const mensaje = snapshot.val();
        mostrarMensajeRemoto(mensaje);
    });
    
    // Actualizar UI
    document.getElementById('conectar-sala').style.display = 'none';
    document.getElementById('desconectar-sala').style.display = 'inline-block';
    document.getElementById('codigo-sala').disabled = true;
    document.getElementById('mi-nombre').disabled = true;
    document.getElementById('personas-conectadas').style.display = 'block';
    
    mostrarAlerta('Conectado a la sala: ' + codigoSala, 'success');
}

// Actualizar lista de personas conectadas
function actualizarListaPersonas(snapshot) {
    const listaPersonas = document.getElementById('lista-personas');
    const estadoConexion = document.getElementById('estado-conexion');
    listaPersonas.innerHTML = '';
    
    const personas = snapshot.val();
    if (!personas) {
        estadoConexion.textContent = '🟢 Conectado - Solo tú en la sala';
        estadoConexion.style.color = '#4CAF50';
        const li = document.createElement('li');
        li.textContent = 'Solo tú';
        listaPersonas.appendChild(li);
        return;
    }
    
    const personasArray = Object.values(personas);
    const cantidad = personasArray.length;
    estadoConexion.textContent = `🟢 Conectado - ${cantidad} ${cantidad === 1 ? 'persona' : 'personas'} en la sala`;
    estadoConexion.style.color = '#4CAF50';
    
    personasArray.forEach(persona => {
        const li = document.createElement('li');
        li.textContent = persona.nombre;
        listaPersonas.appendChild(li);
    });
}

// Desconectar de sala
function desconectarSala() {
    if (salaRef) {
        salaRef.off();
        salaRef = null;
    }
    
    if (presenciaRef) {
        if (miPresenciaKey) {
            presenciaRef.child(miPresenciaKey).remove();
        }
        presenciaRef.off();
        presenciaRef = null;
    }
    
    codigoSalaActual = null;
    miPresenciaKey = null;
    misTimestamps.clear();
    ultimoTextoEnviado = ''; // ✅ NUEVO
    ultimoTimestampLocal = 0; // ✅ NUEVO
    
    document.getElementById('conectar-sala').style.display = 'inline-block';
    document.getElementById('desconectar-sala').style.display = 'none';
    document.getElementById('codigo-sala').disabled = false;
    document.getElementById('mi-nombre').disabled = false;
    document.getElementById('estado-conexion').textContent = '⚪ Sin conexión';
    document.getElementById('estado-conexion').style.color = '#999';
    document.getElementById('personas-conectadas').style.display = 'none';
    
    mostrarAlerta('Desconectado de la sala', 'info');
}

// Enviar mensaje a Firebase
function enviarMensajeFirebase(texto, hablante, nombreHablante, tiempo, timestamp) {
    if (!salaRef) return;
    
    misTimestamps.add(timestamp);
    
    const mensaje = {
        texto: texto,
        hablante: hablante,
        nombreHablante: nombreHablante,
        tiempo: tiempo,
        timestamp: timestamp,
        enviadoPor: document.getElementById('mi-nombre').value
    };
    
    salaRef.push(mensaje);
}

// Mostrar mensaje remoto (CORREGIDO - NO DUPLICAR PROPIOS)
function mostrarMensajeRemoto(mensaje) {
    // SI ES MI PROPIO MENSAJE, NO LO MUESTRES DE NUEVO
    if (misTimestamps.has(mensaje.timestamp)) {
        return;
    }
    
    const textoFinal = document.getElementById('texto-final');
    
    // Evitar duplicados verificando timestamp
    const mensajes = textoFinal.getElementsByClassName('hablante');
    for (let i = 0; i < mensajes.length; i++) {
        if (mensajes[i].getAttribute('data-timestamp') == mensaje.timestamp) {
            return;
        }
    }
    
    const divTexto = document.createElement('div');
    divTexto.className = `hablante hablante-${mensaje.hablante}`;
    divTexto.setAttribute('data-timestamp', mensaje.timestamp);
    divTexto.innerHTML = `
        <span class="tiempo">[${mensaje.tiempo}]</span>
        <strong>${mensaje.nombreHablante}:</strong> ${mensaje.texto}
    `;
    
    textoFinal.appendChild(divTexto);
    divTexto.scrollIntoView({ behavior: 'smooth' });
}

// Cargar nombres de hablantes
function cargarNombresHablantes() {
    const nombresGuardados = localStorage.getItem('nombresHablantes');
    if (nombresGuardados) {
        const nombres = JSON.parse(nombresGuardados);
        document.getElementById('nombre-a').value = nombres.a || 'Hablante A';
        document.getElementById('nombre-b').value = nombres.b || 'Hablante B';
        document.getElementById('nombre-c').value = nombres.c || 'Hablante C';
    }
    actualizarIndicadorHablante();
}

// Guardar nombres de hablantes
function guardarNombresHablantes() {
    const nombres = {
        a: document.getElementById('nombre-a').value || 'Hablante A',
        b: document.getElementById('nombre-b').value || 'Hablante B',
        c: document.getElementById('nombre-c').value || 'Hablante C'
    };
    localStorage.setItem('nombresHablantes', JSON.stringify(nombres));
}

// Actualizar indicador de hablante actual
function actualizarIndicadorHablante() {
    const nombreInput = document.getElementById(`nombre-${hablanteActual}`);
    const nombreActual = nombreInput ? nombreInput.value : `Hablante ${hablanteActual.toUpperCase()}`;
    document.getElementById('nombre-actual').textContent = nombreActual;
}

// Cambiar hablante manualmente
function cambiarHablante() {
    if (hablanteActual === 'a') {
        hablanteActual = 'b';
    } else if (hablanteActual === 'b') {
        hablanteActual = 'c';
    } else {
        hablanteActual = 'a';
    }
    
    actualizarIndicadorHablante();
    const nombreHablante = document.getElementById(`nombre-${hablanteActual}`).value || `Hablante ${hablanteActual.toUpperCase()}`;
    mostrarAlerta(`Ahora habla: ${nombreHablante}`, 'success');
}

// ✅ MEJORADO: Inicializar reconocimiento de voz
function inicializarReconocimiento() {
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'es-PE';
        recognition.maxAlternatives = 1;
        
        recognition.onresult = manejarResultados;
        
        // ✅ MEJORADO: Reiniciar con pausa para móvil
        recognition.onend = function() {
            console.log('🔄 Reconocimiento terminado');
            if (isRecording) {
                setTimeout(() => {
                    try {
                        recognition.start();
                        console.log('✅ Reconocimiento reiniciado');
                    } catch (e) {
                        console.error('❌ Error al reiniciar:', e);
                        isRecording = false;
                        document.getElementById('iniciar').textContent = '▶️ Iniciar';
                        document.getElementById('iniciar').style.background = '#2196F3';
                    }
                }, 300); // Pausa de 300ms
            }
        };
        
        recognition.onstart = function() {
            console.log('▶️ Reconocimiento iniciado');
        };
        
        // ✅ MEJORADO: Manejo de errores específicos de móvil
        recognition.onerror = function(event) {
            console.error('❌ Error de reconocimiento:', event.error);
            
            // No mostrar alertas para errores comunes en móvil
            if (event.error === 'no-speech') {
                console.log('⚠️ No se detectó voz, continuando...');
                return;
            }
            
            if (event.error === 'aborted') {
                console.log('⚠️ Reconocimiento abortado, continuando...');
                return;
            }
            
            if (event.error === 'audio-capture') {
                mostrarAlerta('Error: Micrófono no disponible', 'error');
                isRecording = false;
                return;
            }
            
            mostrarAlerta('Error: ' + event.error, 'error');
        };
        
        console.log('✅ Reconocimiento de voz inicializado correctamente');
    } else {
        alert('Tu navegador no soporta reconocimiento de voz. Usa Google Chrome.');
    }
}

// ✅ MEJORADO: Manejar resultados de transcripción
function manejarResultados(event) {
    let textoTemporal = '';
    
    for (let i = resultadoProcesado; i < event.results.length; i++) {
        const resultado = event.results[i];
        const texto = resultado[0].transcript.trim();
        
        if (resultado.isFinal) {
            // ✅ NUEVO: Verificar que no sea duplicado
            if (texto && texto !== ultimoTextoEnviado && texto.length > 0) {
                ultimoTextoEnviado = texto;
                agregarTexto(texto, hablanteActual, true);
                resultadoProcesado = i + 1;
            }
        } else {
            textoTemporal += texto;
        }
    }
    
    if (textoTemporal) {
        document.getElementById('texto-temporal').innerHTML = 
            `<span class="temporal">🎤 Escuchando: ${textoTemporal}</span>`;
    } else {
        document.getElementById('texto-temporal').innerHTML = '';
    }
}

// ✅ MEJORADO: Agregar texto a la pantalla
function agregarTexto(texto, hablante, guardar = false) {
    const ahora = new Date();
    const tiempo = ahora.toLocaleTimeString();
    const nombreHablante = document.getElementById(`nombre-${hablante}`).value || `Hablante ${hablante.toUpperCase()}`;
    const timestamp = Date.now();
    
    // ✅ NUEVO: Evitar duplicados por timing (menos de 500ms)
    if (timestamp - ultimoTimestampLocal < 500) {
        console.log('⚠️ Mensaje duplicado bloqueado por timing');
        return;
    }
    
    ultimoTimestampLocal = timestamp;
    
    const divTexto = document.createElement('div');
    divTexto.className = `hablante hablante-${hablante}`;
    divTexto.setAttribute('data-timestamp', timestamp);
    divTexto.innerHTML = `
        <span class="tiempo">[${tiempo}]</span>
        <strong>${nombreHablante}:</strong> ${texto}
    `;
    
    document.getElementById('texto-final').appendChild(divTexto);
    divTexto.scrollIntoView({ behavior: 'smooth' });
    
    if (guardar) {
        guardarTranscripcion(texto, hablante, tiempo, nombreHablante);
        enviarMensajeFirebase(texto, hablante, nombreHablante, tiempo, timestamp);
    }
}

// Guardar transcripción en localStorage
function guardarTranscripcion(texto, hablante, tiempo, nombreHablante) {
    const registro = {
        id: Date.now(),
        fecha: new Date().toISOString(),
        hora: tiempo,
        hablante: hablante,
        nombreHablante: nombreHablante,
        texto: texto
    };
    
    db.conversaciones.push(registro);
    localStorage.setItem('transcripciones', JSON.stringify(db.conversaciones));
}

// Cargar historial del localStorage
function cargarHistorial() {
    const guardado = localStorage.getItem('transcripciones');
    if (guardado) {
        db.conversaciones = JSON.parse(guardado);
        mostrarHistorial();
    }
}

// Mostrar historial en pantalla
function mostrarHistorial() {
    const lista = document.getElementById('lista-conversaciones');
    lista.innerHTML = '';
    
    if (db.conversaciones.length === 0) {
        lista.innerHTML = '<p style="color: #999; text-align: center;">No hay conversaciones guardadas</p>';
        return;
    }
    
    const ultimas = db.conversaciones.slice(-10).reverse();
    ultimas.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversacion-item';
        const nombreMostrar = conv.nombreHablante || `Hablante ${conv.hablante.toUpperCase()}`;
        
        item.innerHTML = `
            <div class="fecha">${new Date(conv.fecha).toLocaleDateString()} - ${conv.hora}</div>
            <strong>${nombreMostrar}:</strong> ${conv.texto}
        `;
        
        lista.appendChild(item);
    });
}

// Limpiar conversación
function limpiarConversacion() {
    document.getElementById('texto-final').innerHTML = '';
    document.getElementById('texto-temporal').innerHTML = '';
    resultadoProcesado = 0;
    ultimoTextoEnviado = ''; // ✅ NUEVO
    ultimoTimestampLocal = 0; // ✅ NUEVO
    mostrarAlerta('Conversación limpiada', 'success');
}

// Borrar historial
function borrarHistorial() {
    if (confirm('¿Estás seguro de borrar TODO el historial guardado? Esta acción no se puede deshacer.')) {
        db.conversaciones = [];
        localStorage.removeItem('transcripciones');
        mostrarHistorial();
        mostrarAlerta('Historial eliminado completamente', 'success');
    }
}

// Exportar a CSV
function exportarCSV() {
    if (db.conversaciones.length === 0) {
        alert('No hay conversaciones para exportar');
        return;
    }
    
    let csv = 'Fecha,Hora,Hablante,Texto\n';
    db.conversaciones.forEach(conv => {
        const fecha = new Date(conv.fecha).toLocaleDateString();
        const nombreHablante = conv.nombreHablante || conv.hablante;
        csv += `${fecha},${conv.hora},${nombreHablante},"${conv.texto}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transcripciones_${Date.now()}.csv`;
    link.click();
    
    mostrarAlerta('Archivo CSV descargado exitosamente', 'success');
}

// Mostrar alertas
function mostrarAlerta(mensaje, tipo) {
    const alerta = document.getElementById('alertas-sonido');
    alerta.textContent = mensaje;
    alerta.style.display = 'block';
    alerta.style.background = tipo === 'error' ? '#ff4444' : '#4CAF50';
    
    setTimeout(() => {
        alerta.style.display = 'none';
    }, 3000);
}

// ✅ MEJORADO: Configurar eventos de botones
function configurarBotones() {
    // Botón Iniciar
    document.getElementById('iniciar').addEventListener('click', function() {
        if (!isRecording) {
            // ✅ NUEVO: Resetear todas las variables
            resultadoProcesado = 0;
            ultimoTextoEnviado = '';
            ultimoTimestampLocal = 0;
            
            try {
                recognition.start();
                isRecording = true;
                this.textContent = '🎤 Grabando...';
                this.style.background = '#4CAF50';
                mostrarAlerta('Transcripción iniciada', 'success');
            } catch (e) {
                console.error('Error al iniciar:', e);
                mostrarAlerta('Error al iniciar micrófono', 'error');
            }
        }
    });
    
    // Botón Detener
    document.getElementById('detener').addEventListener('click', function() {
        if (isRecording) {
            recognition.stop();
            isRecording = false;
            resultadoProcesado = 0;
            ultimoTextoEnviado = ''; // ✅ NUEVO
            ultimoTimestampLocal = 0; // ✅ NUEVO
            
            document.getElementById('iniciar').textContent = '▶️ Iniciar';
            document.getElementById('iniciar').style.background = '#2196F3';
            document.getElementById('texto-temporal').innerHTML = '';
            mostrarAlerta('Transcripción detenida', 'success');
        }
    });
    
    // Botones de sala
    document.getElementById('conectar-sala').addEventListener('click', conectarSala);
    document.getElementById('desconectar-sala').addEventListener('click', desconectarSala);
    
    // Botón cambiar hablante
    document.getElementById('cambiar-hablante').addEventListener('click', cambiarHablante);
    
    // Botón limpiar
    document.getElementById('limpiar').addEventListener('click', function() {
        if (confirm('¿Estás seguro de limpiar toda la conversación visible?')) {
            limpiarConversacion();
        }
    });
    
    // Botón guardar
    document.getElementById('guardar').addEventListener('click', function() {
        mostrarHistorial();
        mostrarAlerta('Historial actualizado', 'success');
    });
    
    // Botón exportar
    document.getElementById('exportar').addEventListener('click', function() {
        exportarCSV();
    });
    
    // Botón borrar historial
    document.getElementById('borrar-historial').addEventListener('click', function() {
        borrarHistorial();
    });
    
    // Cambios en nombres de hablantes
    document.getElementById('nombre-a').addEventListener('change', function() {
        guardarNombresHablantes();
        if (hablanteActual === 'a') actualizarIndicadorHablante();
    });
    
    document.getElementById('nombre-b').addEventListener('change', function() {
        guardarNombresHablantes();
        if (hablanteActual === 'b') actualizarIndicadorHablante();
    });
    
    document.getElementById('nombre-c').addEventListener('change', function() {
        guardarNombresHablantes();
        if (hablanteActual === 'c') actualizarIndicadorHablante();
    });
}
