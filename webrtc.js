/**
 * ============================================================================
 * WebRTC Básico - Exemplo P2P Local (DataChannel)
 * ============================================================================
 * 
 * Como o WebRTC funciona?
 * Para dois navegadores (Peers) conversarem diretamente (P2P), eles precisam:
 * 1. Trocar dados de sessão/mídia: SDP (Offer / Answer).
 * 2. Trocar dados de rotas de rede: ICE Candidates (IPs e portas).
 * 
 * Em uma aplicação real, essa troca inicial é feita via WebSocket ou HTTP
 * (chamado de Servidor de Sinalização / Signaling Server).
 * Aqui, simulamos os dois participantes (Alice e Bob) no mesmo script para
 * entender o fluxo fundamental.
 */

async function startWebRTC() {
  console.log("🚀 Iniciando fluxo WebRTC...\n");

  // 1. Configuração com servidor STUN público (usado para descobrir IPs públicos na internet)
  const configuration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  // 2. Criação das instâncias dos dois participantes (Peers)
  const peerAlice = new RTCPeerConnection(configuration);
  const peerBob = new RTCPeerConnection(configuration);

  // ---------------------------------------------------------------------------
  // 3. ICE Candidates: "Como Alice e Bob se acham na rede?"
  // Sempre que o navegador descobre um caminho de rede, ele dispara 'onicecandidate'.
  // ---------------------------------------------------------------------------
  peerAlice.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("📍 Alice enviou ICE Candidate -> Bob");
      peerBob.addIceCandidate(event.candidate);
    }
  };

  peerBob.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("📍 Bob enviou ICE Candidate -> Alice");
      peerAlice.addIceCandidate(event.candidate);
    }
  };

  // Monitorar o status da conexão
  peerAlice.onconnectionstatechange = () => {
    console.log(`📶 Alice - Estado da Conexão: ${peerAlice.connectionState}`);
  };

  peerBob.onconnectionstatechange = () => {
    console.log(`📶 Bob - Estado da Conexão: ${peerBob.connectionState}`);
  };

  // ---------------------------------------------------------------------------
  // 4. DataChannel: Canal para troca de dados arbitrários (texto, JSON, arquivos)
  // Alice cria o canal, e Bob escuta o evento 'ondatachannel'.
  // ---------------------------------------------------------------------------
  const aliceChannel = peerAlice.createDataChannel("chat");

  aliceChannel.onopen = () => {
    console.log("🟢 Alice: DataChannel aberto!");
    // Enviando mensagem direta via P2P
    aliceChannel.send("Olá Bob! Essa mensagem veio direto de Alice via P2P 🚀");
  };

  aliceChannel.onmessage = (event) => {
    console.log(`📩 Alice recebeu de Bob: "${event.data}"`);
  };

  peerBob.ondatachannel = (event) => {
    const bobChannel = event.channel;
    console.log("🟢 Bob: Recebeu o DataChannel de Alice!");

    bobChannel.onmessage = (event) => {
      console.log(`📩 Bob recebeu de Alice: "${event.data}"`);
      // Bob responde de volta diretamente
      bobChannel.send("E aí Alice! Mensagem recebida com sucesso sem passar por nenhum servidor! 🎉");
    };
  };

  // ---------------------------------------------------------------------------
  // 5. Negociação SDP (Offer & Answer): "O que cada um suporta e como vão se comunicar?"
  // ---------------------------------------------------------------------------

  // Passo A: Alice cria a Oferta (Offer) e define como sua descrição local
  console.log("1️⃣ Alice cria a Oferta (Offer)...");
  const offer = await peerAlice.createOffer();
  await peerAlice.setLocalDescription(offer);

  // Passo B: Bob recebe a Oferta de Alice e define como sua descrição remota
  console.log("2️⃣ Bob recebe a Oferta de Alice...");
  await peerBob.setRemoteDescription(peerAlice.localDescription);

  // Passo C: Bob cria a Resposta (Answer) e define como sua descrição local
  console.log("3️⃣ Bob cria a Resposta (Answer)...");
  const answer = await peerBob.createAnswer();
  await peerBob.setLocalDescription(answer);

  // Passo D: Alice recebe a Resposta de Bob e define como sua descrição remota
  console.log("4️⃣ Alice recebe a Resposta de Bob...");
  await peerAlice.setRemoteDescription(peerBob.localDescription);

  console.log("✨ Negociação SDP concluída! Estabelecendo conexão P2P...\n");
}

// Inicia a demonstração
startWebRTC();
