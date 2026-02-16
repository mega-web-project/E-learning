import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const seedCourses = [
  { id: 'c-101', title: 'React Fundamentals', learners: 86, status: 'Live' },
  { id: 'c-102', title: 'Advanced TypeScript', learners: 54, status: 'Paused' },
  { id: 'c-103', title: 'Node.js APIs', learners: 121, status: 'Live' }
];

function randomFrom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function useCourseSSE(onMessage) {
  useEffect(() => {
    let source;
    let fallbackTimer;

    try {
      source = new EventSource('/api/events');
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          onMessage(payload);
        } catch {
          // ignore malformed events
        }
      };
      source.onerror = () => {
        source?.close();
      };
    } catch {
      // noop: fallback starts below
    }

    if (!source || source.readyState === EventSource.CLOSED) {
      fallbackTimer = setInterval(() => {
        const id = randomFrom(['c-101', 'c-102', 'c-103']);
        onMessage({
          type: 'upsert',
          course: {
            id,
            title:
              id === 'c-101'
                ? 'React Fundamentals'
                : id === 'c-102'
                  ? 'Advanced TypeScript'
                  : 'Node.js APIs',
            learners: Math.floor(Math.random() * 200) + 20,
            status: randomFrom(['Live', 'Paused', 'Draft'])
          }
        });
      }, 2500);
    }

    return () => {
      source?.close();
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, [onMessage]);
}

function fakePersist(course) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < 0.15) {
        reject(new Error('Simulated write conflict'));
      } else {
        resolve(course);
      }
    }, 300);
  });
}

export default function App() {
  const [courses, setCourses] = useState(seedCourses);
  const [form, setForm] = useState({ title: '', learners: 0, status: 'Draft' });
  const [error, setError] = useState('');
  const [highlighted, setHighlighted] = useState({});
  const [pendingIds, setPendingIds] = useState({});
  const previousCourses = useRef(courses);

  const totalLearners = useMemo(
    () => courses.reduce((sum, course) => sum + Number(course.learners || 0), 0),
    [courses]
  );

  const highlightCourse = (id) => {
    setHighlighted((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setHighlighted((prev) => {
        const clone = { ...prev };
        delete clone[id];
        return clone;
      });
    }, 1500);
  };

  const markPending = (id, active) => {
    setPendingIds((prev) => {
      const clone = { ...prev };
      if (active) clone[id] = true;
      else delete clone[id];
      return clone;
    });
  };

  const handleSSE = (payload) => {
    if (!payload?.type) return;

    setCourses((current) => {
      if (payload.type === 'delete') {
        return current.filter((course) => course.id !== payload.id);
      }
      if (payload.type === 'upsert' && payload.course?.id) {
        const existing = current.find((course) => course.id === payload.course.id);
        highlightCourse(payload.course.id);
        if (existing) {
          return current.map((course) =>
            course.id === payload.course.id ? { ...course, ...payload.course } : course
          );
        }
        return [...current, payload.course];
      }
      return current;
    });
  };

  useCourseSSE(handleSSE);

  useEffect(() => {
    previousCourses.current = courses;
  }, [courses]);

  const onCreate = async (event) => {
    event.preventDefault();
    setError('');

    const id = `c-${Math.floor(Math.random() * 100000)}`;
    const newCourse = { id, ...form, learners: Number(form.learners) };
    const before = previousCourses.current;

    setCourses((current) => [newCourse, ...current]);
    highlightCourse(id);
    markPending(id, true);

    try {
      await fakePersist(newCourse);
      setForm({ title: '', learners: 0, status: 'Draft' });
    } catch (e) {
      setCourses(before);
      setError(`Create failed: ${e.message}`);
    } finally {
      markPending(id, false);
    }
  };

  const onToggleStatus = async (course) => {
    const nextStatus = course.status === 'Live' ? 'Paused' : 'Live';
    const optimistic = { ...course, status: nextStatus };
    const before = courses;

    setCourses((current) =>
      current.map((item) => (item.id === course.id ? optimistic : item))
    );
    highlightCourse(course.id);
    markPending(course.id, true);

    try {
      await fakePersist(optimistic);
    } catch (e) {
      setCourses(before);
      setError(`Update failed: ${e.message}`);
    } finally {
      markPending(course.id, false);
    }
  };

  const onDelete = async (course) => {
    const before = courses;

    setCourses((current) => current.filter((item) => item.id !== course.id));
    markPending(course.id, true);

    try {
      await fakePersist(course);
    } catch (e) {
      setCourses(before);
      setError(`Delete failed: ${e.message}`);
    } finally {
      markPending(course.id, false);
    }
  };

  return (
    <div className="app-shell">
      <header>
        <h1>Learning Ops Live Dashboard</h1>
        <p>Real-time enrollment visibility with optimistic interactions</p>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <span>Total courses</span>
          <strong>{courses.length}</strong>
        </div>
        <div className="stat-card">
          <span>Total learners</span>
          <strong>{totalLearners}</strong>
        </div>
      </section>

      <section className="layout-grid">
        <form className="create-form" onSubmit={onCreate}>
          <h2>Add course</h2>
          <input
            required
            placeholder="Course title"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          />
          <input
            required
            min={0}
            type="number"
            placeholder="Learners"
            value={form.learners}
            onChange={(e) => setForm((prev) => ({ ...prev, learners: e.target.value }))}
          />
          <select
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option>Draft</option>
            <option>Live</option>
            <option>Paused</option>
          </select>
          <button type="submit">Create optimistically</button>
          {error ? <p className="error-banner">{error}</p> : null}
        </form>

        <div>
          <h2>Live courses</h2>
          <motion.ul className="course-list" layout>
            <AnimatePresence>
              {courses.map((course) => (
                <motion.li
                  key={course.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className={[
                    'course-item',
                    highlighted[course.id] ? 'highlight' : '',
                    pendingIds[course.id] ? 'pending' : ''
                  ].join(' ')}
                >
                  <div>
                    <h3>{course.title}</h3>
                    <p>
                      {course.learners} learners • <strong>{course.status}</strong>
                    </p>
                  </div>
                  <div className="actions">
                    <button onClick={() => onToggleStatus(course)}>
                      {course.status === 'Live' ? 'Pause' : 'Go live'}
                    </button>
                    <button className="danger" onClick={() => onDelete(course)}>
                      Delete
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        </div>
      </section>
    </div>
  );
}
