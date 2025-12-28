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

// Variables globales - TRANSCRIPCIÓN
let recognition;
let isRecording = false;
let db = { conversaciones: [] };
let hablanteActual = 'a';
let codigoSalaActual = null;
let salaRef = null;
let presenciaRef = null;
let miPresenciaKey = null;
let misTimestamps = new Set();
let ultimoTextoEnviado = '';
let ultimoTimestampLocal = 0;
let debounceTimer = null;
let textoAcumulado = '';

// Variables globales - COMPARTIR PANTALLA
let localStream = null;
let peerConnection = null;
let remoteStream = null;
let estaCompartiendo = false;

// Configuración WebRTC
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Inicializar cuando carga la página
document.addEventListener('DOMContentLoaded', function() {
    inicializarReconocimiento();
    cargarHistorial();
    cargarNombresHablantes();
    cargarNombreUsuario();
    configurarBotones();
});

// ========== FUNCIONES DE USUARIO ==========

function cargarNombreUsuario() {
    const nombreGuardado = localStorage.getItem('miNombre');
    if (nombreGuardado) {
        document.getElementById('mi-nombre').value = nombreGuardado;
    }
}

function guardarNombreUsuario() {
    const nombre = document.getElementById('mi-nombre').value.trim();
    if (nombre) {
        localStorage.setItem('miNombre', nombre);
    }
}

// ========== FUNCIONES DE SALA ==========

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
    ultimoTextoEnviado = '';
    ultimoTimestampLocal = 0;
    textoAcumulado = '';
    if (debounceTimer) clearTimeout(debounceTimer);
    
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
    
    // Escuchar pantalla compartida
    escucharPantallaCompartida();
    
    // Actualizar UI
    document.getElementById('conectar-sala').style.display = 'none';
    document.getElementById('desconectar-sala').style.display = 'inline-block';
    document.getElementById('codigo-sala').disabled = true;
    document.getElementById('mi-nombre').disabled = true;
    document.getElementById('personas-conectadas').style.display = 'block';
    
    mostrarAlerta('Conectado a la sala: ' + codigoSala, 'success');
}

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

function desconectarSala() {
    // Detener compartir pantalla si está activo
    if (estaCompartiendo) {
        detenerCompartirPantalla();
    }
    
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
    ultimoTextoEnviado = '';
    ultimoTimestampLocal = 0;
    textoAcumulado = '';
    if (debounceTimer) clearTimeout(debounceTimer);
    
    document.getElementById('conectar-sala').style.display = 'inline-block';
    document.getElementById('desconectar-sala').style.display = 'none';
    document.getElementById('codigo-sala').disabled = false;
    document.getElementById('mi-nombre').disabled = false;
    document.getElementById('estado-conexion').textContent = '⚪ Sin conexión';
    document.getElementById('estado-conexion').style.color = '#999';
    document.getElementById('personas-conectadas').style.display = 'none';
    
    mostrarAlerta('Desconectado de la sala', 'info');
}

// ========== FUNCIONES DE MENSAJES ==========

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

function mostrarMensajeRemoto(mensaje) {
    if (misTimestamps.has(mensaje.timestamp)) {
        return;
    }
    
    const textoFinal = document.getElementById('texto-final');
    
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

// ========== FUNCIONES DE HABLANTES ==========

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

function guardarNombresHablantes() {
    const nombres = {
        a: document.getElementById('nombre-a').value || 'Hablante A',
        b: document.getElementById('nombre-b').value || 'Hablante B',
        c: document.getElementById('nombre-c').value || 'Hablante C'
    };
    localStorage.setItem('nombresHablantes', JSON.stringify(nombres));
}

function actualizarIndicadorHablante() {
    const nombreInput = document.getElementById(`nombre-${hablanteActual}`);
    const nombreActual = nombreInput ? nombreInput.value : `Hablante ${hablanteActual.toUpperCase()}`;
    document.getElementById('nombre-actual').textContent = nombreActual;
}

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

// ========== FUNCIONES DE RECONOCIMIENTO DE VOZ ==========

function inicializarReconocimiento() {
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'es-PE';
        recognition.maxAlternatives = 1;
        
        recognition.onresult = manejarResultados;
        
        recognition.onend = function() {
            console.log('🔄 Reconocimiento terminado');
            
            if (textoAcumulado && textoAcumulado.trim()) {
                procesarTextoFinal(textoAcumulado);
                textoAcumulado = '';
            }
            
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
                }, 500);
            }
        };
        
        recognition.onstart = function() {
            console.log('▶️ Reconocimiento iniciado');
            textoAcumulado = '';
        };
        
        recognition.onerror = function(event) {
            console.error('❌ Error de reconocimiento:', event.error);
            
            if (event.error === 'no-speech') {
                console.log('⚠️ No se detectó voz');
                return;
            }
            
            if (event.error === 'aborted') {
                console.log('⚠️ Reconocimiento abortado');
                return;
            }
            
            if (event.error === 'audio-capture') {
                mostrarAlerta('Error: Micrófono no disponible', 'error');
                isRecording = false;
                return;
            }
            
            mostrarAlerta('Error: ' + event.error, 'error');
        };
        
        console.log('✅ Reconocimiento de voz inicializado');
    } else {
        alert('Tu navegador no soporta reconocimiento de voz. Usa Google Chrome.');
    }
}

function manejarResultados(event) {
    const ultimoIndice = event.results.length - 1;
    const ultimoResultado = event.results[ultimoIndice];
    const texto = ultimoResultado[0].transcript;
    
    if (ultimoResultado.isFinal) {
        console.log('📝 Texto final recibido:', texto);
        textoAcumulado = texto;
        
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        
        debounceTimer = setTimeout(() => {
            if (textoAcumulado && textoAcumulado.trim()) {
                procesarTextoFinal(textoAcumulado);
                textoAcumulado = '';
            }
        }, 1000);
        
        document.getElementById('texto-temporal').innerHTML = '';
        
    } else {
        document.getElementById('texto-temporal').innerHTML = 
            `<span class="temporal">🎤 Escuchando: ${texto}</span>`;
    }
}

function procesarTextoFinal(texto) {
    if (!texto || texto.length === 0) return;
    
    texto = texto.trim().replace(/\s+/g, ' ');
    
    if (ultimoTextoEnviado && esSimilar(texto, ultimoTextoEnviado)) {
        console.log('⚠️ Texto similar bloqueado:', texto);
        return;
    }
    
    const ahora = Date.now();
    if (ahora - ultimoTimestampLocal < 1000) {
        console.log('⚠️ Mensaje muy rápido bloqueado');
        return;
    }
    
    console.log('✅ Enviando texto:', texto);
    ultimoTextoEnviado = texto;
    ultimoTimestampLocal = ahora;
    
    agregarTexto(texto, hablanteActual, true);
}

function esSimilar(texto1, texto2) {
    const t1 = texto1.toLowerCase().trim();
    const t2 = texto2.toLowerCase().trim();
    
    if (t1 === t2) return true;
    if (t1.includes(t2) || t2.includes(t1)) return true;
    
    const palabras1 = t1.split(' ');
    const palabras2 = t2.split(' ');
    const diferencia = Math.abs(palabras1.length - palabras2.length);
    
    if (diferencia <= 2) {
        let comunes = 0;
        palabras1.forEach(p => {
            if (palabras2.includes(p)) comunes++;
        });
        
        const similitud = comunes / Math.max(palabras1.length, palabras2.length);
        if (similitud > 0.7) return true;
    }
    
    return false;
}

function agregarTexto(texto, hablante, guardar = false) {
    const ahora = new Date();
    const tiempo = ahora.toLocaleTimeString();
    const nombreHablante = document.getElementById(`nombre-${hablante}`).value || `Hablante ${hablante.toUpperCase()}`;
    const timestamp = Date.now();
    
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

// ========== FUNCIONES DE HISTORIAL ==========

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

function cargarHistorial() {
    const guardado = localStorage.getItem('transcripciones');
    if (guardado) {
        db.conversaciones = JSON.parse(guardado);
        mostrarHistorial();
    }
}

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

function limpiarConversacion() {
    document.getElementById('texto-final').innerHTML = '';
    document.getElementById('texto-temporal').innerHTML = '';
    ultimoTextoEnviado = '';
    ultimoTimestampLocal = 0;
    textoAcumulado = '';
    if (debounceTimer) clearTimeout(debounceTimer);
    mostrarAlerta('Conversación limpiada', 'success');
}

function borrarHistorial() {
    if (confirm('¿Estás seguro de borrar TODO el historial guardado? Esta acción no se puede deshacer.')) {
        db.conversaciones = [];
        localStorage.removeItem('transcripciones');
        mostrarHistorial();
        mostrarAlerta('Historial eliminado completamente', 'success');
    }
}

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

// ========== FUNCIONES DE COMPARTIR PANTALLA ==========

async function iniciarCompartirPantalla() {
    if (!codigoSalaActual) {
        alert('Debes conectarte a una sala primero');
        return;
    }
    
    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always',
                displaySurface: 'monitor'
            },
            audio: false
        });
        
        document.getElementById('video-local').srcObject = localStream;
        document.getElementById('contenedor-video-local').style.display = 'block';
        
        await crearOferta();
        
        estaCompartiendo = true;
        document.getElementById('btn-compartir').style.display = 'none';
        document.getElementById('btn-detener-compartir').style.display = 'inline-block';
        
        localStream.getVideoTracks()[0].onended = () => {
            detenerCompartirPantalla();
        };
        
        console.log('✅ Compartiendo pantalla');
        mostrarAlerta('Compartiendo pantalla en la sala', 'success');
        
    } catch (error) {
        console.error('❌ Error al compartir pantalla:', error);
        mostrarAlerta('Error: No se pudo acceder a la pantalla', 'error');
    }
}

function detenerCompartirPantalla() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    document.getElementById('video-local').srcObject = null;
    document.getElementById('contenedor-video-local').style.display = 'none';
    document.getElementById('btn-compartir').style.display = 'inline-block';
    document.getElementById('btn-detener-compartir').style.display = 'none';
    
    if (codigoSalaActual) {
        database.ref('salas/' + codigoSalaActual + '/compartiendo').remove();
        database.ref('salas/' + codigoSalaActual + '/ice-candidates').remove();
    }
    
    estaCompartiendo = false;
    mostrarAlerta('Dejaste de compartir pantalla', 'info');
}

async function crearOferta() {
    peerConnection = new RTCPeerConnection(configuration);
    
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && codigoSalaActual) {
            database.ref('salas/' + codigoSalaActual + '/ice-candidates').push({
                candidate: event.candidate.toJSON(),
                type: 'offer',
                timestamp: Date.now()
            });
        }
    };
    
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    database.ref('salas/' + codigoSalaActual + '/compartiendo').set({
        offer: {
            type: offer.type,
            sdp: offer.sdp
        },
        usuario: document.getElementById('mi-nombre').value,
        timestamp: Date.now()
    });
}

async function verPantallaCompartida(offerData) {
    try {
        peerConnection = new RTCPeerConnection(configuration);
        
        peerConnection.ontrack = (event) => {
            if (!remoteStream) {
                remoteStream = new MediaStream();
                document.getElementById('video-remoto').srcObject = remoteStream;
                document.getElementById('contenedor-video-remoto').style.display = 'block';
            }
            remoteStream.addTrack(event.track);
        };
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && codigoSalaActual) {
                database.ref('salas/' + codigoSalaActual + '/ice-candidates').push({
                    candidate: event.candidate.toJSON(),
                    type: 'answer',
                    timestamp: Date.now()
                });
            }
        };
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offerData.offer));
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        database.ref('salas/' + codigoSalaActual + '/respuesta').set({
            answer: {
                type: answer.type,
                sdp: answer.sdp
            },
            timestamp: Date.now()
        });
        
        mostrarAlerta('Viendo pantalla compartida de ' + offerData.usuario, 'success');
        
    } catch (error) {
        console.error('❌ Error al ver pantalla:', error);
    }
}

function escucharPantallaCompartida() {
    if (!codigoSalaActual) return;
    
    database.ref('salas/' + codigoSalaActual + '/compartiendo').on('value', (snapshot) => {
        const data = snapshot.val();
        const miNombre = document.getElementById('mi-nombre').value;
        
        if (data && data.usuario !== miNombre) {
            verPantallaCompartida(data);
        } else if (!data) {
            document.getElementById('contenedor-video-remoto').style.display = 'none';
            if (remoteStream) {
                remoteStream.getTracks().forEach(track => track.stop());
                remoteStream = null;
            }
            if (peerConnection && !estaCompartiendo) {
                peerConnection.close();
                peerConnection = null;
            }
        }
    });
    
    database.ref('salas/' + codigoSalaActual + '/ice-candidates').on('child_added', async (snapshot) => {
        const data = snapshot.val();
        if (peerConnection && data.candidate) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (error) {
                console.error('Error al agregar ICE candidate:', error);
            }
        }
    });
}

// ========== ALERTAS ==========

function mostrarAlerta(mensaje, tipo) {
    const alerta = document.getElementById('alertas-sonido');
    alerta.textContent = mensaje;
    alerta.style.display = 'block';
    alerta.style.background = tipo === 'error' ? '#ff4444' : '#4CAF50';
    
    setTimeout(() => {
        alerta.style.display = 'none';
    }, 3000);
}

// ========== CONFIGURAR BOTONES ==========

function configurarBotones() {
    // Botón Iniciar
    document.getElementById('iniciar').addEventListener('click', function() {
        if (!isRecording) {
            ultimoTextoEnviado = '';
            ultimoTimestampLocal = 0;
            textoAcumulado = '';
            if (debounceTimer) clearTimeout(debounceTimer);
            
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
            if (textoAcumulado && textoAcumulado.trim()) {
                procesarTextoFinal(textoAcumulado);
            }
            
            if (debounceTimer) clearTimeout(debounceTimer);
            
            recognition.stop();
            isRecording = false;
            ultimoTextoEnviado = '';
            ultimoTimestampLocal = 0;
            textoAcumulado = '';
            
            document.getElementById('iniciar').textContent = '▶️ Iniciar';
            document.getElementById('iniciar').style.background = '#2196F3';
            document.getElementById('texto-temporal').innerHTML = '';
            mostrarAlerta('Transcripción detenida', 'success');
        }
    });
    
    // Botones de sala
    document.getElementById('conectar-sala').addEventListener('click', conectarSala);
    document.getElementById('desconectar-sala').addEventListener('click', desconectarSala);
    
    // Botones de pantalla compartida
    document.getElementById('btn-compartir').addEventListener('click', iniciarCompartirPantalla);
    document.getElementById('btn-detener-compartir').addEventListener('click', detenerCompartirPantalla);
    
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
