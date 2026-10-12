"""Real GPU materialization stays reachable during explicit history collection."""
import multiprocessing
import unittest

import test_access_control as access
from context_time_travel.store import Store, NotFound


def collect(directory,root,results):
    results.put(Store(directory).collect_history(root))


class RetentionTests(unittest.TestCase):
    setUpClass=classmethod(access.AccessControlTests.setUpClass.__func__)
    tearDownClass=classmethod(access.AccessControlTests.tearDownClass.__func__)
    setUp=access.AccessControlTests.setUp
    check=access.AccessControlTests.check

    def test_g5_008_retention_and_gc(self):
        candidate=self.sut.feed(self.root,self.A)
        saved=self.sut.snapshot_bytes(candidate)
        self.sut.store.release_history(candidate)
        self.sut.evict_all()
        self.assertEqual(self.sut.snapshot_bytes(candidate),saved)
        self.check(candidate,self.P+self.A)
        self.sut.store.retain('historical',candidate)
        self.assertEqual(self.sut.store.collect_history(self.root)['deleted'],[])
        self.sut.store.release_retained('historical')
        with self.sut.materialize(candidate):
            self.assertEqual(self.sut.store.collect_history(self.root)['deleted'],[])
            self.assertEqual(self.sut.snapshot_bytes(candidate),saved)
        self.assertEqual(self.sut.store.collect_history(self.root)['deleted'],[candidate])
        # A remaining hot image must not resurrect explicitly deleted history.
        self.assertIn(candidate,self.sut.cache)
        with self.assertRaises(NotFound):
            self.sut.next_logits(candidate)
        self.check(self.root,self.P)

    def test_g5_009_concurrent_gc_and_load(self):
        candidate=self.sut.feed(self.root,self.A)
        garbage=self.sut.feed(self.root,self.B)
        self.sut.store.release_history(candidate)
        self.sut.store.release_history(garbage)
        saved=self.sut.snapshot_bytes(candidate)
        context=multiprocessing.get_context('spawn')
        results=context.Queue()
        worker=context.Process(target=collect,args=(self.tmp.name,self.root,results))
        try:
            with self.sut.materialize(candidate):
                worker.start()
                collected=results.get(timeout=30)
                worker.join(10)
                self.assertEqual(worker.exitcode,0)
                self.assertEqual(collected['deleted'],[garbage])
                self.assertEqual(self.sut.snapshot_bytes(candidate),saved)
            self.check(candidate,self.P+self.A)
            self.sut.store.fork('retained',candidate)
            self.assertEqual(self.sut.store.collect_history(self.root)['deleted'],[])
            self.check(candidate,self.P+self.A)
        finally:
            if worker.is_alive():worker.terminate();worker.join(10)
            results.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
