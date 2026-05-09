const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

exports.default = function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const appexPath = path.join(appPath, 'Contents', 'PlugIns', 'SortieFinderSync.appex');
  if (!fs.existsSync(appexPath)) {
    throw new Error(`[finder-sync] embedded extension is missing at ${appexPath}`);
  }

  const identity = resolveSigningIdentity(context, appPath);
  const finderEntitlements = path.join(
    context.packager.projectDir,
    '..',
    'macos',
    'SortieFinderSync',
    'SortieFinderSync',
    'SortieFinderSync.entitlements',
  );
  const appEntitlements = path.join(
    context.packager.projectDir,
    'resources',
    'entitlements.mac.plist',
  );

  signBundle(identity, finderEntitlements, appexPath);
  console.log(`[finder-sync] signed appex with ${identity}`);

  signBundle(identity, appEntitlements, appPath);
  console.log(`[finder-sync] re-signed app with ${identity}`);

  run('codesign', ['--verify', '--deep', '--strict', '--verbose=4', appexPath]);
  run('codesign', ['--verify', '--verbose=4', appPath]);
  console.log('[finder-sync] verified signed app bundle');
};

function resolveSigningIdentity(context, appPath) {
  const configuredIdentity = context.packager.platformSpecificBuildOptions.identity;
  const explicitIdentity =
    configuredIdentity ?? process.env.CSC_NAME ?? process.env.SORTIE_MAC_CODE_SIGN_IDENTITY;
  if (explicitIdentity && explicitIdentity !== 'null') return explicitIdentity;

  const signedIdentity = readLeafCertificateHash(appPath);
  if (signedIdentity) return signedIdentity;

  return '-';
}

function readLeafCertificateHash(appPath) {
  const result = spawnSync('codesign', ['-d', '-r-', appPath], {
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const match = output.match(/certificate leaf = H"([0-9a-fA-F]+)"/);
  return match?.[1] ?? null;
}

function signBundle(identity, entitlements, target) {
  const args = [
    '--force',
    '--sign',
    identity,
    '--options',
    'runtime',
    '--entitlements',
    entitlements,
  ];
  if (identity !== '-') {
    args.push('--timestamp');
  }
  args.push(target);
  run('codesign', args);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`[finder-sync] command failed: ${command} ${args.join(' ')}`);
  }
}
