export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    console.error('Alice /api/chat : variable ANTHROPIC_API_KEY absente sur Vercel');
    return res.status(500).json({ error: 'Clé API manquante' });
  }

  // Validation : on limite la taille pour éviter qu'un inconnu fasse grimper la facture
  const incoming = req.body && req.body.messages;
  const roles = ['system', 'user', 'assistant'];
  if (!Array.isArray(incoming) || incoming.length === 0 || incoming.length > 24 ||
      !incoming.every(m => m && roles.includes(m.role) && typeof m.content === 'string' && m.content.length <= 6000)) {
    return res.status(400).json({ error: 'Requête invalide' });
  }

  // Le site envoie le prompt système dans la liste ; Anthropic le veut à part
  const system = incoming.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  let messages = incoming.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
  // La conversation doit commencer par le visiteur (on retire le message d'accueil d'Alice)
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (messages.length === 0) {
    return res.status(400).json({ error: 'Requête invalide' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
        max_tokens: 500,
        temperature: 0.7,
        system,
        messages
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // L'erreur exacte apparaît dans Vercel > Logs
      console.error('Alice /api/chat : erreur Anthropic', response.status, JSON.stringify(data));
      return res.status(502).json({ error: 'Erreur du fournisseur IA', status: response.status });
    }

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    // Même format que le site attend déjà : choices[0].message.content
    return res.status(200).json({ choices: [{ message: { role: 'assistant', content: text } }] });
  } catch (error) {
    console.error('Alice /api/chat : exception', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
