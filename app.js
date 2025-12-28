// ✨ CONFIGURACIÓN DE FIREBASE
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
let db = {
    conversaciones: []
};
let resultadoProcesado = 0;
let hablanteActual = 'a';
let codigoSalaActual = null;
let salaRef = null;
let presenciaRef = null;
let miPresenciaKey = null;
let personasConectadasRef = null;

document.addEventListener('DOMContentLoaded', function() {
    inicializarReconocimiento();
    cargarHistorial();
    configurarBotones();
    cargarNombresHablantes();
    cargarNombreUsuario();
});

// ✨ NUEVA FUNCIÓN: Cargar nombre de usuario guardado
function cargarNombreUsuario() {
    const nombreGuardado = localStorage.getItem('miNombre');
    if (nombreGuardado) {
        document.getElementById('mi-nombre').value = nombreGuardado;
    }
}

// ✨ NUEVA FUNCIÓN: Guardar nombre de usuario
function guardarNombreUsuario() {
    const nombre = document.getElementById('mi-nombre').value.trim();
    if (nombre) {
        localStorage.setItem('miNombre', nombre);
    }
}

// ✨ FUNCIÓN MEJORADA: Conectar a sala con presencia
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
    
    codigoSalaActual = codigoSala;
    salaRef = database.ref('salas/' + codigoSala + '/mensajes');
    presenciaRef = database.ref('salas/' + codigoSala + '/presencia');
    
    // ✨ Agregar mi presencia
    const miPresencia = presenciaRef.push({
        nombre: miNombre,
        conectado: true,
        timestamp: Date.now()
    });
    
    miPresenciaKey = miPresencia.key;
    
    // ✨ Eliminar mi presencia cuando me desconecto
    miPresencia.onDisconnect().remove();
    
    // ✨ Escuchar cambios en personas conectadas
    presenciaRef.on('value', function(snapshot) {
        actualizarListaPersonas(snapshot);
    });
    
    // Escuchar nuevos mensajes
    salaRef.on('child_added', function(snapshot) {
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

// ✨ NUEVA FUNCIÓN: Actualizar lista de personas conectadas
function actualizarListaPersonas(snapshot) {
    const listaPersonas = document.getElementById('lista-personas');
    listaPersonas.innerHTML = '';
    
    const personas = snapshot.val();
    if (!personas) {
        document.getElementById('estado-conexion').textContent = '🟢 Conectado - Solo tú en la sala';
        document.getElementById('estado-conexion').style.color = '#4CAF50';
        return;
    }
    
    const personasArray = Object.values(personas);
    const cantidad = personasArray.length;
    
    document.getElementById('estado-conexion').textContent = 
        `🟢 Conectado - ${cantidad} ${cantidad === 1 ? 'persona' : 'personas'} en la sala`;
    document.getElementById('estado-conexion').style.color = '#4CAF50';
    
    personasArray.forEach(persona => {
        const li = document.createElement('li');
        li.textContent = persona.nombre;
        listaPersonas.appendChild(li);
    });
}

function desconectarSala() {
    if (salaRef) {
        salaRef.off();
        salaRef = null;
    }
    
    if (presenciaRef) {
        // ✨ Eliminar mi presencia
        if (miPresenciaKey) {
            presenciaRef.child(miPresenciaKey).remove();
        }
        presenciaRef.off();
        presenciaRef = null;
    }
    
    codigoSalaActual = null;
    miPresenciaKey = null;
    
    document.getElementById('conectar-sala').style.display = 'inline-block';
    document.getElementById('desconectar-sala').style.display = 'none';
    document.getElementById('codigo-sala').disabled = false;
    document.getElementById('mi-nombre').disabled = false;
    document.getElementById('estado-conexion').textContent = '⚪ Sin conexión';
    document.getElementById('estado-conexion').style.color = '#999';
    document.getElementById('personas-conectadas').style.display = 'none';
    
    mostrarAlerta('Desconectado de la sala', 'info');
}

function enviarMensajeFirebase(texto, hablante, nombreHablante, tiempo) {
    if (!salaRef) return;
    
    const mensaje = {
        texto: texto,
        hablante: hablante,
        nombreHablante: nombreHablante,
        tiempo: tiempo,
        timestamp: Date.now(),
        enviadoPor: document.getElementById('mi-nombre').value
    };
    
    salaRef.push(mensaje);
}

function mostrarMensajeRemoto(mensaje) {
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

function inicializarReconocimiento() {
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'es-PE';
        recognition.maxAlternatives = 1;
        recognition.onresult = manejarResultados;
        
        recognition.onend = function() {
            if (isRecording) {
                recognition.start();
                resultadoProcesado = 0;
            }
        };
        
        recognition.onstart = function() {
            resultadoProcesado = 0;
        };
        
        recognition.onerror = function(event) {
            console.error('Error de reconocimiento:', event.error);
            mostrarAlerta('Error: ' + event.error, 'error');
        };
        
        console.log('Reconocimiento de voz inicializado correctamente');
    } else {
        alert('Tu navegador no soporta reconocimiento de voz. Usa Google Chrome.');
    }
}

function manejarResultados(event) {
    let textoTemporal = '';
    
    for (let i = resultadoProcesado; i < event.results.length; i++) {
        const texto = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
            agregarTexto(texto, hablanteActual, true);
            resultadoProcesado = i + 1;
        } else {
            textoTemporal += texto;
        }
    }
    
    if (textoTemporal) {
        document.getElementById('texto-temporal').innerHTML = 
            `<span class="temporal">Escuchando: ${textoTemporal}</span>`;
    } else {
        document.getElementById('texto-temporal').innerHTML = '';
    }
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
        enviarMensajeFirebase(texto, hablante, nombreHablante, tiempo);
    }
}

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
    resultadoProcesado = 0;
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

function mostrarAlerta(mensaje, tipo) {
    const alerta = document.getElementById('alertas-sonido');
    alerta.textContent = mensaje;
    alerta.style.display = 'block';
    alerta.style.background = tipo === 'error' ? '#ff4444' : '#4CAF50';
    
    setTimeout(() => {
        alerta.style.display = 'none';
    }, 3000);
}

function configurarBotones() {
    document.getElementById('iniciar').addEventListener('click', function() {
        if (!isRecording) {
            document.getElementById('texto-final').innerHTML = '';
            document.getElementById('texto-temporal').innerHTML = '';
            resultadoProcesado = 0;
            
            recognition.start();
            isRecording = true;
            this.textContent = '🎤 Grabando...';
            this.style.background = '#4CAF50';
            mostrarAlerta('Transcripción iniciada', 'success');
        }
    });
    
    document.getElementById('detener').addEventListener('click', function() {
        if (isRecording) {
            recognition.stop();
            isRecording = false;
            resultadoProcesado = 0;
            document.getElementById('iniciar').textContent = '▶️ Iniciar';
            document.getElementById('iniciar').style.background = '#2196F3';
            document.getElementById('texto-temporal').innerHTML = '';
            mostrarAlerta('Transcripción detenida', 'success');
        }
    });
    
    document.getElementById('conectar-sala').addEventListener('click', conectarSala);
    document.getElementById('desconectar-sala').addEventListener('click', desconectarSala);
    
    document.getElementById('cambiar-hablante').addEventListener('click', cambiarHablante);
    
    document.getElementById('limpiar').addEventListener('click', function() {
        if (confirm('¿Estás seguro de limpiar toda la conversación visible?')) {
            limpiarConversacion();
        }
    });
    
    document.getElementById('guardar').addEventListener('click', function() {
        mostrarHistorial();
        mostrarAlerta('Historial actualizado', 'success');
    });
    
    document.getElementById('exportar').addEventListener('click', function() {
        exportarCSV();
    });
    
    document.getElementById('borrar-historial').addEventListener('click', function() {
        borrarHistorial();
    });
    
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
