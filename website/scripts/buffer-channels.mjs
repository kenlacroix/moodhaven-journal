// One-off helper: list your Buffer channels and confirm the LinkedIn channel id
// behind BUFFER_CHANNEL_ID. Used by the workflow's `check` mode to validate both
// secrets without posting anything.
//
//   BUFFER_API_KEY=xxxx node scripts/buffer-channels.mjs
//
// Prints each channel's id / service / name. The announcer posts to the single
// LinkedIn channel pointed at by BUFFER_CHANNEL_ID.

const BUFFER_ENDPOINT = 'https://api.buffer.com';
const TARGET_SERVICE = 'linkedin';
const apiKey = process.env.BUFFER_API_KEY;

if (!apiKey) {
  console.error('Set BUFFER_API_KEY (from publish.buffer.com/settings/api) and re-run.');
  process.exit(1);
}

const gql = async (query) => {
  const res = await fetch(BUFFER_ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body.errors ?? body)}`);
  }
  return body.data;
};

const main = async () => {
  const orgs = (await gql('query { account { organizations { id name } } }')).account?.organizations ?? [];
  if (orgs.length === 0) {
    console.log('No organizations found on this account.');
    return;
  }
  console.log(`Auth OK. Found ${orgs.length} organization(s).`);
  const all = [];
  const orgIds = new Set();
  for (const org of orgs) {
    orgIds.add(org.id);
    const channels =
      (await gql(`query { channels(input: { organizationId: ${JSON.stringify(org.id)} }) { id name service } }`))
        .channels ?? [];
    console.log(`\nOrganization: ${org.name} (${org.id}) — ${channels.length} channel(s)`);
    for (const c of channels) {
      all.push(c);
      const mark = c.service === TARGET_SERVICE ? `  <-- ${c.service} (announcer target)` : '';
      console.log(`  ${c.service.padEnd(12)} ${c.id}  ${c.name}${mark}`);
    }
  }

  if (all.length === 0) {
    console.error(
      '\nFAIL: this API key sees 0 channels. Connect LinkedIn in the SAME Buffer ' +
        'account the key was generated from (publish.buffer.com), then re-run.',
    );
    process.exit(1);
  }

  const linkedin = all.find((c) => c.service === TARGET_SERVICE);
  if (linkedin) console.log(`\nPASS  linkedin -> ${linkedin.name} (${linkedin.id})`);
  else console.log(`\nMISS  linkedin -> not connected (the announcer has no channel to post to)`);

  // If BUFFER_CHANNEL_ID is set, assert it's a real LinkedIn channel.
  const configured = process.env.BUFFER_CHANNEL_ID;
  if (configured) {
    if (orgIds.has(configured)) {
      console.error(
        `\nFAIL: BUFFER_CHANNEL_ID is an ORGANIZATION id, not a channel id. ` +
          `Use one of the channel ids listed above (the linkedin one).`,
      );
      process.exit(1);
    }
    const match = all.find((c) => c.id === configured);
    if (!match) {
      console.error(`\nFAIL: BUFFER_CHANNEL_ID is not among your channels (ids listed above).`);
      process.exit(1);
    }
    if (match.service !== TARGET_SERVICE) {
      console.error(`\nFAIL: BUFFER_CHANNEL_ID is a ${match.service} channel, not linkedin.`);
      process.exit(1);
    }
    console.log(`\nPASS: BUFFER_CHANNEL_ID -> ${match.name} (linkedin). Auth and channel both valid.`);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
