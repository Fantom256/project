import * as courseService from '../services/course.service.js';

export async function getAllCourses(req, res) {
  try {
    const courses = await courseService.getAllCourses();
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения курсов' });
  }
}

export async function getCourseById(req, res) {
  try {
    const { id } = req.params;
    const course = await courseService.getCourseById(id);

    if (!course) {
      return res.status(404).json({ error: 'Курс не найден' });
    }

    res.json(course);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения курса' });
  }
}