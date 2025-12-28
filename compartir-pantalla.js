// ========== COMPARTIR PANTALLA CON WEBRTC ==========

let localStream = null;
let peerConnection = null;
let remoteStream = null;

// Configuración de servidores ICE (para conexión P2P)
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ✅ INICIAR COMPARTIR PANTALLA
async function iniciarCompartirPantalla() {
    try {
        // Solicitar acceso a la pantalla
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always' // Mostrar el cursor
            },
            audio: false // Cambiar a true si quieres compartir audio
        });
        
        // Mostrar tu pantalla localmente
        document.getElementById('video-local').srcObject = localStream;
        
        // Crear conexión peer
        await crearOferta();
        
        console.log('✅ Compartiendo pantalla');
        mostrarAlerta('Compartiendo pantalla en la sala', 'success');
        
        // Cambiar botones
        document.getElementById('btn-compartir').style.display = 'none';
        document.getElementById('btn-detener-compartir').style.display = 'inline-block';
        
    } catch (error) {
        console.error('❌ Error al compartir pantalla:', error);
        mostrarAlerta('Error: No se pudo acceder a la pantalla', 'error');
    }
}

// ✅ DETENER COMPARTIR PANTALLA
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
    document.getElementById('btn-compartir').style.display = 'inline-block';
    document.getElementById('btn-detener-compartir').style.display = 'none';
    
    // Notificar a Firebase que dejaste de compartir
    if (salaRef) {
        database.ref('salas/' + codigoSalaActual + '/compartiendo').remove();
    }
    
    mostrarAlerta('Dejaste de compartir pantalla', 'info');
}

// ✅ CREAR OFERTA (quien comparte)
async function crearOferta() {
    peerConnection = new RTCPeerConnection(configuration);
    
    // Agregar pistas de video a la conexión
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    // Manejar candidatos ICE
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            // Enviar candidato a Firebase
            database.ref('salas/' + codigoSalaActual + '/ice-candidates').push({
                candidate: event.candidate.toJSON(),
                type: 'offer',
                timestamp: Date.now()
            });
        }
    };
    
    // Crear oferta
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    // Guardar oferta en Firebase
    database.ref('salas/' + codigoSalaActual + '/compartiendo').set({
        offer: {
            type: offer.type,
            sdp: offer.sdp
        },
        usuario: document.getElementById('mi-nombre').value,
        timestamp: Date.now()
    });
}

// ✅ VER PANTALLA COMPARTIDA (espectador)
async function verPantallaCompartida(offerData) {
    try {
        peerConnection = new RTCPeerConnection(configuration);
        
        // Recibir stream remoto
        peerConnection.ontrack = (event) => {
            if (!remoteStream) {
                remoteStream = new MediaStream();
                document.getElementById('video-remoto').srcObject = remoteStream;
            }
            remoteStream.addTrack(event.track);
        };
        
        // Manejar candidatos ICE
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                database.ref('salas/' + codigoSalaActual + '/ice-candidates').push({
                    candidate: event.candidate.toJSON(),
                    type: 'answer',
                    timestamp: Date.now()
                });
            }
        };
        
        // Establecer descripción remota
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offerData.offer));
        
        // Crear respuesta
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        // Enviar respuesta a Firebase
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

// ✅ ESCUCHAR CUANDO ALGUIEN COMPARTE PANTALLA
function escucharPantallaCompartida() {
    if (!codigoSalaActual) return;
    
    database.ref('salas/' + codigoSalaActual + '/compartiendo').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.usuario !== document.getElementById('mi-nombre').value) {
            // Alguien está compartiendo, mostrar video
            document.getElementById('contenedor-video-remoto').style.display = 'block';
            verPantallaCompartida(data);
        } else if (!data) {
            // Nadie está compartiendo
            document.getElementById('contenedor-video-remoto').style.display = 'none';
            if (remoteStream) {
                remoteStream.getTracks().forEach(track => track.stop());
                remoteStream = null;
            }
        }
    });
    
    // Escuchar candidatos ICE
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
