"""Process crash and competing-writer schedules for history collection."""
import multiprocessing
import os
import tempfile
import unittest

from context_time_travel.store import Store, NotFound


def crash_collect(directory,root):
    def fault(point):
        if point=='after_history_unlink':
            os._exit(42)
    Store(directory,fault_hook=fault).collect_history(root)
    os._exit(43)


def compete(directory,root,parent,operation,barrier,results):
    store=Store(directory)
    barrier.wait(timeout=20)
    try:
        if operation=='collect':
            value=store.collect_history(root)['deleted']
        elif operation=='fork':
            value=store.fork('racing',parent).tip
        else:
            value=store.append(parent,[7],{})
        results.put((operation,'ok',value))
    except NotFound:
        results.put((operation,'missing',None))


class CollectionProcessTests(unittest.TestCase):
    def test_crash_sweep_preserves_remaining_ancestry(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory)
            root=store.create_root('contract',[1],{})
            store.fork('main',root)
            receipt=store.move('main',0,root,'stable-receipt')
            parent=store.append(root,[2],{})
            child=store.append(parent,[3],{})
            store.release_history(parent)
            store.release_history(child)
            ctx=multiprocessing.get_context('spawn')
            worker=ctx.Process(target=crash_collect,args=(directory,root))
            worker.start();worker.join(20)
            try:
                self.assertEqual(worker.exitcode,42)
            finally:
                if worker.is_alive():worker.terminate();worker.join(10)
            reopened=Store(directory)
            with self.assertRaises(NotFound):
                reopened.get_snapshot(child)
            self.assertEqual(reopened.lineage(parent)[1],[1,2])
            for path in reopened.objects.glob('*.json'):
                reopened.lineage(path.stem)
            self.assertEqual(reopened.move('main',0,root,'stable-receipt'),receipt)
            self.assertEqual(reopened.collect_history(root)['deleted'],[parent])
            self.assertEqual(reopened.head('main'),receipt)
            self.assertEqual(reopened.collect_history(root)['deleted'],[])

    def test_collection_races_fork_and_append(self):
        ctx=multiprocessing.get_context('spawn')
        for operation in ('fork','append'):
            for repeat in range(4):
                with self.subTest(operation=operation,repeat=repeat), tempfile.TemporaryDirectory() as directory:
                    store=Store(directory)
                    root=store.create_root('contract',[1],{})
                    parent=store.append(root,[2],{})
                    store.release_history(parent)
                    barrier,results=ctx.Barrier(2),ctx.Queue()
                    workers=[ctx.Process(target=compete,args=(directory,root,parent,op,barrier,results))
                             for op in ('collect',operation)]
                    try:
                        for worker in workers:worker.start()
                        observed={row[0]:row[1:] for row in [results.get(timeout=25),results.get(timeout=25)]}
                        for worker in workers:
                            worker.join(10)
                            self.assertEqual(worker.exitcode,0)
                        self.assertEqual(observed['collect'][0],'ok')
                        state,value=observed[operation]
                        if state=='ok':
                            self.assertEqual(observed['collect'][1],[])
                            self.assertEqual(store.lineage(value)[1],[1,2] if operation=='fork' else [1,2,7])
                        else:
                            self.assertEqual(state,'missing')
                            self.assertEqual(observed['collect'][1],[parent])
                        for path in store.objects.glob('*.json'):
                            store.lineage(path.stem)
                    finally:
                        for worker in workers:
                            if worker.is_alive():worker.terminate();worker.join(10)
                        results.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
