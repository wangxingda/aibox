"""Exercise deployment sequencing without touching Docker or a real database."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'manage.sh'


class ManageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        (root / 'env').touch()
        (root / 'git').write_text('''#!/bin/sh
printf '%s\\n' "$*" >> "$TEST_LOG.git"
case "$*" in
  *'lfs version') [ -z "$FAIL_LFS_VERSION" ] || exit 1 ;;
  *'lfs pull'*) [ -z "$FAIL_LFS_PULL" ] || exit 1 ;;
  *'lfs ls-files') [ -z "$LFS_POINTER" ] || echo 'abcdef1234 - public/sites/example.mp4' ;;
  *'symbolic-ref --quiet --short HEAD') echo main ;;
  *'config --get branch.main.remote') echo origin ;;
  *'remote get-url origin') echo "${TEST_REMOTE_URL:-https://github.com/wangxingda/aibox.git}" ;;
esac
exit 0
''')
        (root / 'docker').write_text('''#!/usr/bin/env python3
import io, os, sys, tarfile
args = sys.argv[1:]
with open(os.environ['TEST_LOG'], 'a') as log:
    log.write(' '.join(args) + '\\n')
if args[:2] == ['image', 'inspect']:
    sys.exit(1)
if 'exec' in args and 'mysqldump' in ' '.join(args):
    sys.stdout.write('CREATE TABLE example (id INT);\\n')
if 'run' in args and 'tarfile' in ' '.join(args):
    with tarfile.open(fileobj=sys.stdout.buffer, mode='w|gz') as archive:
        entry = tarfile.TarInfo('uploads/')
        entry.type = tarfile.DIRTYPE
        archive.addfile(entry)
if 'app.migrate' in args and os.environ.get('FAIL_MIGRATION'):
    sys.exit(1)
''')
        for name in ('docker', 'git'):
            (root / name).chmod(0o755)
        self.root = root
        self.env = dict(os.environ, PATH=f"{root}:{os.environ['PATH']}",
                        AIBOX_ENV_FILE=str(root / 'env'), AIBOX_BACKUP_DIR=str(root / 'backups'),
                        TEST_LOG=str(root / 'calls'))

    def run_script(self, command):
        result = subprocess.run(['bash', str(SCRIPT), command], env=self.env, capture_output=True, text=True)
        calls = (self.root / 'calls').read_text().splitlines()
        return result, calls

    def test_restart_only_restarts_application_services(self):
        result, calls = self.run_script('restart')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(any(line.endswith('restart api worker frontend') for line in calls))
        self.assertFalse(any(line.endswith('restart mysql redis nginx') for line in calls))

    def test_update_backs_up_before_migration_and_starts_afterwards(self):
        result, calls = self.run_script('update')
        self.assertEqual(result.returncode, 0, result.stderr)
        stop = next(i for i, x in enumerate(calls) if x.endswith('stop worker api'))
        dump = next(i for i, x in enumerate(calls) if 'mysqldump' in x)
        archive = next(i for i, x in enumerate(calls) if 'tarfile' in x)
        migrate = next(i for i, x in enumerate(calls) if 'app.migrate' in x)
        start = next(i for i, x in enumerate(calls) if x.endswith('up -d --no-build --wait'))
        self.assertTrue(stop < dump < archive < migrate < start)
        self.assertEqual(len(list((self.root / 'backups').glob('*/mysql.sql.gz'))), 1)
        self.assertEqual(len(list((self.root / 'backups').glob('*/uploads.tar.gz'))), 1)

    def test_update_converts_github_https_to_ssh_before_pull(self):
        result, _ = self.run_script('update')
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = (self.root / 'calls.git').read_text().splitlines()
        convert = next(i for i, line in enumerate(calls) if line.endswith('remote set-url origin git@github.com:wangxingda/aibox.git'))
        pull = next(i for i, line in enumerate(calls) if line.endswith('pull --ff-only'))
        self.assertLess(convert, pull)
        lfs_pull = next(i for i, line in enumerate(calls) if 'lfs pull' in line)
        self.assertLess(pull, lfs_pull)

    def test_build_downloads_lfs_assets(self):
        result, calls = self.run_script('build')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(any('lfs pull' in line for line in (self.root / 'calls.git').read_text().splitlines()))
        self.assertTrue(any(line.endswith(' build') for line in calls))

    def test_lfs_failures_do_not_build_or_stop_services(self):
        for command in ('build', 'update'):
            for failure in ('FAIL_LFS_VERSION', 'FAIL_LFS_PULL', 'LFS_POINTER'):
                with self.subTest(command=command, failure=failure):
                    self.env[failure] = '1'
                    (self.root / 'calls').unlink(missing_ok=True)
                    result, calls = self.run_script(command)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertFalse(any(line.endswith(' build') or 'stop worker api' in line for line in calls))
                    del self.env[failure]

    def test_update_rejects_other_non_ssh_remotes(self):
        self.env['TEST_REMOTE_URL'] = 'https://example.com/repo.git'
        result, calls = self.run_script('update')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('必须使用 SSH', result.stderr)
        self.assertFalse(any(' build' in line for line in calls))

    def test_migration_failure_does_not_start_or_delete_images(self):
        self.env['FAIL_MIGRATION'] = '1'
        result, calls = self.run_script('update')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('数据库迁移失败', result.stderr)
        self.assertFalse(any(x.endswith('up -d --no-build --wait') for x in calls))
        self.assertFalse(any(x.startswith('image rm ') for x in calls))
        self.assertEqual(len(list((self.root / 'backups').glob('*/mysql.sql.gz'))), 1)


if __name__ == '__main__':
    unittest.main()
